/**
 * Importação de pedidos por planilha: uma linha por item; as linhas com a
 * mesma referência (coluna Pedido) formam um pedido. Cada pedido nasce
 * ABERTO, com o endereço principal do cliente e o estoque reservado, como no
 * registro pela tela. Tudo ou nada: o estoque disponível tem de cobrir a soma
 * pedida em toda a planilha.
 *
 * A referência (coluna Pedido) é gravada no pedido e funciona como chave de
 * idempotência: a mesma referência não é importada duas vezes para o mesmo
 * cliente, salvo se o pedido anterior estiver CANCELADO.
 */
import cds, { type Request, type Service } from '@sap/cds'
import { Clientes, Itens, Pedidos, type ResultadoImportacao } from '#cds-models/pedidoscompras'
import { Pedidos as PedidosServico } from '#cds-models/PedidosService'
import { lerPlanilha, valor, paraInteiro, type Coluna } from './planilha.js'
import { normalizarCpf, falharImportacao, concluirImportacao, textosDoErro } from './importacao.js'
import type { ParametrosImportacao } from './importacao-clientes.js'
import { enderecoPrincipal, STATUS } from './pedidos.js'
import { formatarCpf } from './util.js'
import { lerConteudo } from './requisicao.js'

/** Tamanho de Pedidos.referenciaImportacao. */
const TAMANHO_REFERENCIA = 40

/** Colunas aceitas na planilha: nome do campo, sinônimos do cabeçalho e obrigatoriedade. */
const COLUNAS: Coluna[] = [
  {
    campo: 'Pedido',
    sinonimos: ['REFERENCIA', 'REFERENCIADOPEDIDO', 'NUMEROPEDIDO', 'NUMERO', 'IDPEDIDO', 'ID', 'AGRUPADOR'],
    obrigatoria: true
  },
  { campo: 'CPF', sinonimos: ['CPFCLIENTE', 'CPFDOCLIENTE'], obrigatoria: true },
  { campo: 'SKU', sinonimos: ['CODIGOSKU', 'CODIGO', 'ITEM'], obrigatoria: true },
  { campo: 'Quantidade', sinonimos: ['QTDE', 'QTD', 'QUANTIDADEITEM'], obrigatoria: true },
  { campo: 'Observação', sinonimos: ['OBS', 'OBSERVACOES'] }
]

/** Linha da planilha já normalizada. */
interface LinhaPedido {
  linha: number
  ref: string
  cpf: string
  sku: string
  qtde: number
  obs: string
}

/** Pedido formado pelas linhas de uma mesma referência. */
interface GrupoPedido {
  ref: string
  linha: number
  cpf: string
  cliente_ID: string
  obs: string
  itens: { item_ID: string, qtdeItemPedido: number }[]
}

/**
 * Action importarPlanilha do PedidosService.
 *  1. Valida o formato de cada linha (referência, CPF, SKU, quantidade).
 *  2. Confere clientes (existentes, ativos, com endereço principal) e itens
 *     (existentes e ativos) e agrupa as linhas por referência.
 *  3. Recusa referência já importada para o mesmo cliente.
 *  4. Confere se o estoque disponível cobre a soma pedida na planilha.
 *  5. Cria cada pedido pelo serviço (registro com reserva de estoque) e
 *     grava a referência. Qualquer erro desfaz a importação inteira.
 * @param req requisição da action (arquivo em base64)
 * @param srv PedidosService
 * @returns undefined quando a importação falha
 */
export async function importarPedidos(req: Request<ParametrosImportacao>, srv: Service): Promise<ResultadoImportacao | undefined> {
  const { registros, erros } = lerPlanilha(await lerConteudo(req.data.arquivo), COLUNAS)
  if (erros.length) return falharImportacao(req, erros)

  // 1) Formato de cada linha
  const linhas: LinhaPedido[] = []
  for (const reg of registros) {
    const pref = `Linha ${reg.linha}: `
    const antes = erros.length
    const qtde = paraInteiro(valor(reg, 'Quantidade'))
    const linha = {
      linha: reg.linha,
      ref: valor(reg, 'Pedido').toUpperCase(),
      cpf: normalizarCpf(valor(reg, 'CPF')),
      sku: valor(reg, 'SKU').toUpperCase(),
      qtde: qtde ?? 0,
      obs: valor(reg, 'Observação')
    }
    if (!linha.ref) erros.push(`${pref}Pedido (referência que agrupa os itens) é obrigatório.`)
    else if (linha.ref.length > TAMANHO_REFERENCIA) {
      erros.push(`${pref}Pedido (referência) excede ${TAMANHO_REFERENCIA} caracteres.`)
    }
    if (linha.cpf.length !== 11) erros.push(`${pref}CPF inválido (${valor(reg, 'CPF')}).`)
    if (!linha.sku) erros.push(`${pref}SKU é obrigatório.`)
    if (!(linha.qtde > 0)) erros.push(`${pref}Quantidade deve ser um número inteiro maior que zero.`)
    if (linha.obs.length > 500) erros.push(`${pref}Observação excede 500 caracteres.`)
    if (erros.length === antes) linhas.push(linha)
  }
  if (erros.length) return falharImportacao(req, erros)

  // 2) Clientes, itens e agrupamento por referência
  const clientes = new Map(
    (await SELECT.from(Clientes).columns('ID', 'cpf', 'clienteAtivo').where({ cpf: { in: [...new Set(linhas.map(l => l.cpf))] } }))
      .map(c => [c.cpf!, c])
  )
  const itens = new Map(
    (await SELECT.from(Itens).columns('ID', 'sku', 'itemAtivo', 'qtdeEstoque', 'qtdeReservada')
      .where({ sku: { in: [...new Set(linhas.map(l => l.sku))] } })).map(i => [i.sku!, i])
  )
  const grupos = new Map<string, GrupoPedido>()
  const situacaoCliente = new Map<string, string | null>()
  const demanda = new Map<string, number>()
  for (const linha of linhas) {
    const pref = `Linha ${linha.linha}: `
    const grupo = grupos.get(linha.ref)
    if (grupo && grupo.cpf !== linha.cpf) {
      erros.push(`${pref}o pedido ${linha.ref} tem linhas com CPFs diferentes.`)
      continue
    }
    const cliente = clientes.get(linha.cpf)
    if (!situacaoCliente.has(linha.cpf)) {
      let motivo: string | null = null
      if (!cliente) motivo = `cliente com CPF ${formatarCpf(linha.cpf)} não encontrado`
      else if (!cliente.clienteAtivo) motivo = `cliente com CPF ${formatarCpf(linha.cpf)} está inativo`
      else if (!(await enderecoPrincipal(cliente.ID))) motivo = `cliente com CPF ${formatarCpf(linha.cpf)} não possui endereço principal`
      situacaoCliente.set(linha.cpf, motivo)
    }
    const motivoCliente = situacaoCliente.get(linha.cpf)
    if (motivoCliente) erros.push(`${pref}${motivoCliente}.`)
    const item = itens.get(linha.sku)
    if (!item) erros.push(`${pref}item com SKU ${linha.sku} não encontrado.`)
    else if (!item.itemAtivo) erros.push(`${pref}item ${linha.sku} está inativo.`)
    else demanda.set(item.ID!, (demanda.get(item.ID!) ?? 0) + linha.qtde)
    if (motivoCliente || !cliente || !item?.itemAtivo) continue

    const atual = grupo ?? { ref: linha.ref, linha: linha.linha, cpf: linha.cpf, cliente_ID: cliente.ID!, obs: '', itens: [] }
    if (!atual.obs && linha.obs) atual.obs = linha.obs
    atual.itens.push({ item_ID: item.ID!, qtdeItemPedido: linha.qtde })
    grupos.set(linha.ref, atual)
  }
  // 3) Referência já importada para o mesmo cliente (pedido não cancelado)
  for (const texto of await referenciasJaImportadas([...grupos.values()])) erros.push(texto)

  // 4) O estoque tem de cobrir a soma de toda a planilha
  for (const item of itens.values()) {
    const pedido = demanda.get(item.ID!) ?? 0
    const disponivel = (item.qtdeEstoque ?? 0) - (item.qtdeReservada ?? 0)
    if (pedido > disponivel) {
      erros.push(`Estoque insuficiente para o item ${item.sku}: a planilha pede ${pedido} e há ${disponivel} disponível(is).`)
    }
  }
  if (erros.length) return falharImportacao(req, erros)

  // 5) Criação pelo serviço (registro do pedido com reserva de estoque). A
  // referência é campo controlado pelo backend (o serviço a descarta), então
  // é gravada direto no banco, na mesma transação.
  for (const grupo of grupos.values()) {
    const ID = cds.utils.uuid()
    try {
      await srv.run(INSERT.into(PedidosServico).entries({ ID, cliente_ID: grupo.cliente_ID, observacao: grupo.obs || null, itens: grupo.itens }))
    } catch (e) {
      for (const texto of textosDoErro(e, req.locale)) erros.push(`Pedido ${grupo.ref} (linha ${grupo.linha}): ${texto}`)
      return falharImportacao(req, erros)
    }
    await UPDATE(Pedidos, ID).with({ referenciaImportacao: grupo.ref })
  }
  return concluirImportacao(req, grupos.size)
}

/**
 * Mensagens dos grupos cuja referência o cliente já tem num pedido não
 * cancelado (a referência é a chave de idempotência da importação).
 */
async function referenciasJaImportadas(grupos: GrupoPedido[]): Promise<string[]> {
  if (!grupos.length) return []
  const existentes = await SELECT.from(Pedidos)
    .columns('cliente_ID', 'referenciaImportacao', 'numeroPedido')
    .where({
      referenciaImportacao: { in: [...new Set(grupos.map(g => g.ref))] },
      cliente_ID: { in: [...new Set(grupos.map(g => g.cliente_ID))] },
      statusPedido_code: { '!=': STATUS.cancelado }
    })
  const numeros = new Map(existentes.map(p => [`${p.cliente_ID}|${p.referenciaImportacao}`, p.numeroPedido]))
  return grupos
    .filter(g => numeros.has(`${g.cliente_ID}|${g.ref}`))
    .map(g => `Linha ${g.linha}: o pedido ${g.ref} do cliente ${formatarCpf(g.cpf)} já foi importado ` +
      `(pedido ${numeros.get(`${g.cliente_ID}|${g.ref}`)}).`)
}
