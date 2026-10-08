/**
 * Importação de pedidos por planilha: uma linha por item; as linhas com a
 * mesma referência (coluna Pedido) formam um pedido. Cada pedido nasce
 * ABERTO, com o endereço principal do cliente e o estoque reservado, como no
 * registro pela tela. Tudo ou nada: o estoque disponível tem de cobrir a soma
 * pedida em toda a planilha.
 */
import cds from '@sap/cds'
import { lerPlanilha, valor, paraInteiro } from './planilha.js'
import { normalizarCpf, falharImportacao, concluirImportacao, textosDoErro } from './importacao.js'
import { enderecoPrincipal } from './pedidos.js'
import { formatarCpf } from './util.js'
import { lerConteudo } from './requisicao.js'

const { SELECT, INSERT } = cds.ql

const COLUNAS = [
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

export async function importarPedidos(req, srv) {
  const db = cds.entities('pedidoscompras')
  const { registros, erros } = lerPlanilha(await lerConteudo(req.data.arquivo), COLUNAS)
  if (erros.length) return falharImportacao(req, erros)

  // 1) Formato de cada linha
  const linhas = []
  for (const reg of registros) {
    const pref = `Linha ${reg.linha}: `
    const antes = erros.length
    const linha = {
      linha: reg.linha,
      ref: valor(reg, 'Pedido').toUpperCase(),
      cpf: normalizarCpf(valor(reg, 'CPF')),
      sku: valor(reg, 'SKU').toUpperCase(),
      qtde: paraInteiro(valor(reg, 'Quantidade')),
      obs: valor(reg, 'Observação')
    }
    if (!linha.ref) erros.push(`${pref}Pedido (referência que agrupa os itens) é obrigatório.`)
    if (linha.cpf.length !== 11) erros.push(`${pref}CPF inválido (${valor(reg, 'CPF')}).`)
    if (!linha.sku) erros.push(`${pref}SKU é obrigatório.`)
    if (!(linha.qtde > 0)) erros.push(`${pref}Quantidade deve ser um número inteiro maior que zero.`)
    if (linha.obs.length > 500) erros.push(`${pref}Observação excede 500 caracteres.`)
    if (erros.length === antes) linhas.push(linha)
  }
  if (erros.length) return falharImportacao(req, erros)

  // 2) Clientes, itens e agrupamento por referência
  const clientes = new Map(
    (await SELECT.from(db.Clientes).columns('ID', 'cpf', 'clienteAtivo').where({ cpf: { in: [...new Set(linhas.map(l => l.cpf))] } }))
      .map(c => [c.cpf, c])
  )
  const itens = new Map(
    (await SELECT.from(db.Itens).columns('ID', 'sku', 'itemAtivo', 'qtdeEstoque', 'qtdeReservada')
      .where({ sku: { in: [...new Set(linhas.map(l => l.sku))] } })).map(i => [i.sku, i])
  )
  const grupos = new Map()
  const situacaoCliente = new Map()
  const demanda = new Map()
  for (const linha of linhas) {
    const pref = `Linha ${linha.linha}: `
    const grupo = grupos.get(linha.ref)
    if (grupo && grupo.cpf !== linha.cpf) {
      erros.push(`${pref}o pedido ${linha.ref} tem linhas com CPFs diferentes.`)
      continue
    }
    if (!situacaoCliente.has(linha.cpf)) {
      const cliente = clientes.get(linha.cpf)
      let motivo = null
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
    else demanda.set(item.ID, (demanda.get(item.ID) ?? 0) + linha.qtde)
    if (motivoCliente || !item?.itemAtivo) continue

    const atual = grupo ?? { ref: linha.ref, linha: linha.linha, cpf: linha.cpf, cliente_ID: clientes.get(linha.cpf).ID, obs: '', itens: [] }
    if (!atual.obs && linha.obs) atual.obs = linha.obs
    atual.itens.push({ item_ID: item.ID, qtdeItemPedido: linha.qtde })
    grupos.set(linha.ref, atual)
  }
  // 3) O estoque tem de cobrir a soma de toda a planilha
  for (const item of itens.values()) {
    const pedido = demanda.get(item.ID)
    const disponivel = item.qtdeEstoque - item.qtdeReservada
    if (pedido > disponivel) {
      erros.push(`Estoque insuficiente para o item ${item.sku}: a planilha pede ${pedido} e há ${disponivel} disponível(is).`)
    }
  }
  if (erros.length) return falharImportacao(req, erros)

  // 4) Criação pelo serviço (registro do pedido com reserva de estoque)
  const { Pedidos } = srv.entities
  for (const grupo of grupos.values()) {
    try {
      await srv.run(INSERT.into(Pedidos).entries({ cliente_ID: grupo.cliente_ID, observacao: grupo.obs || null, itens: grupo.itens }))
    } catch (e) {
      for (const texto of textosDoErro(e, req.locale)) erros.push(`Pedido ${grupo.ref} (linha ${grupo.linha}): ${texto}`)
      return falharImportacao(req, erros)
    }
  }
  return concluirImportacao(req, grupos.size)
}
