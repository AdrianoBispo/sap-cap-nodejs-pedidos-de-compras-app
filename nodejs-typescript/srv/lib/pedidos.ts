/**
 * Regras de domínio do pedido, compartilhadas pelos serviços de Pedidos e de
 * Reembolsos e pela importação por planilha: registro do pedido com reserva
 * de estoque, edição dos itens com reserva pela diferença, snapshots,
 * cancelamento, gravação do pagamento e as operações acionadas pela decisão
 * de reembolso (cancelarPorReembolso e retomarPedido).
 *
 * Todas as funções rodam na transação da requisição: se qualquer passo
 * reporta erro (req.error), o CAP desfaz tudo ao final do handler.
 */
import type { Request } from '@sap/cds'
import {
  Clientes, Enderecos, Itens, ItensPedido, Pagamentos, Pedidos, PedidosClienteSnapshots,
  PedidosItensSnapshots, Reembolsos,
  type Item, type ItemPedido, type Pedido, type StatusPagamento_code, type StatusPedido_code
} from '#cds-models/pedidoscompras'
import { Pedidos as PedidosServico } from '#cds-models/PedidosService'
import { erro, info } from './mensagens.js'
import { movimentarEstoque, MOVIMENTO } from './estoque.js'
import { proximoNumeroPedido } from './numeracao.js'
import type { PagamentoProcessado } from './pagamento-simulado.js'
import { arredondar, formatarEndereco, somarQuantidades } from './util.js'

/** Códigos de StatusPedido usados nas regras. */
export const STATUS = Object.freeze({
  aberto: 'ABERTO',
  aguardandoAprovacao: 'AGUARDANDO_APROVACAO',
  processandoReembolso: 'PROCESSANDO_REEMBOLSO',
  cancelado: 'CANCELADO',
  finalizado: 'FINALIZADO'
} as const satisfies Record<string, StatusPedido_code>)

/** Códigos de StatusPagamento usados nas regras. */
export const STATUS_PAGAMENTO = Object.freeze({
  pendente: 'PENDENTE',
  aprovado: 'APROVADO',
  recusado: 'RECUSADO',
  devolvido: 'DEVOLVIDO'
} as const satisfies Record<string, StatusPagamento_code>)

/** Moeda dos pedidos: itens em outra moeda não podem ser pedidos. */
export const MOEDA_PADRAO = 'BRL'

/** Campos do pedido mantidos só pelo backend (nunca vêm da UI). */
export const CAMPOS_CONTROLADOS = [
  'numeroPedido', 'statusPedido_code', 'statusPagamento_code', 'endereco_ID', 'enderecoPrincipalCompleto',
  'valorTotal', 'currency_code', 'dataFinalizacao', 'motivoCancelamento', 'dataCancelamento', 'canceladoPor',
  'referenciaImportacao'
] as const satisfies readonly (keyof Pedido)[]

export type MotivoSnapshot = 'FINALIZACAO' | 'CANCELAMENTO'

/** Endereço principal do cliente com o texto completo. */
export interface EnderecoPrincipal {
  ID: string
  completo: string
}

/** Item do estoque com os campos usados no registro e na edição. */
type ItemEstoque = Pick<Item, 'ID' | 'sku' | 'itemAtivo' | 'precoUnitario' | 'currency_code' | 'qtdeEstoque' | 'qtdeReservada'>

/**
 * Remove do payload os campos que só o backend mantém.
 * @param pedido dados do pedido (alterados)
 */
export function removerCamposControlados(pedido: Pedido): void {
  for (const campo of CAMPOS_CONTROLADOS) delete pedido[campo]
}

/**
 * Endereço principal atual do cliente, com o texto completo formatado.
 * @returns null se não houver cliente ou endereço principal
 */
export async function enderecoPrincipal(clienteID: string | null | undefined): Promise<EnderecoPrincipal | null> {
  if (!clienteID) return null
  const end = await SELECT.one.from(Enderecos)
    .columns('ID', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf')
    .where({ cliente_ID: clienteID, principal: true })
  return end?.ID ? { ID: end.ID, completo: formatarEndereco(end) } : null
}

/**
 * Quantidades já reservadas pelo pedido, lidas dos itens gravados (não do rascunho).
 * @returns item_ID -> quantidade
 */
export async function reservaAtual(pedidoID: string): Promise<Map<string, number>> {
  const linhas = await SELECT.from(ItensPedido).columns('item_ID', 'qtdeItemPedido').where({ pedido_ID: pedidoID })
  return somarQuantidades(linhas)
}

/**
 * Registra a mensagem de ação não permitida no status atual do pedido
 * (pedido finalizado, cancelado ou outro status).
 */
export function erroStatus(req: Request, pedido: Pick<Pedido, 'statusPedido_code'>): Error {
  if (pedido.statusPedido_code === STATUS.finalizado) return erro(req, 409, 'PEDIDO_FINALIZADO_IMUTAVEL')
  if (pedido.statusPedido_code === STATUS.cancelado) return erro(req, 409, 'PEDIDO_CANCELADO_IMUTAVEL')
  return erro(req, 409, 'PEDIDO_STATUS_INVALIDO', { status: pedido.statusPedido_code })
}

/**
 * Itens do estoque por ID, com os campos usados no registro e na edição.
 * @returns ID -> item
 */
async function carregarItens(ids: string[]): Promise<Map<string, ItemEstoque>> {
  if (!ids.length) return new Map()
  const linhas: ItemEstoque[] = await SELECT.from(Itens)
    .columns('ID', 'sku', 'itemAtivo', 'precoUnitario', 'currency_code', 'qtdeEstoque', 'qtdeReservada')
    .where({ ID: { in: ids } })
  return new Map(linhas.map(i => [i.ID!, i]))
}

/** Saldo disponível (estoque - reservada) de um item. */
const disponivel = (item: ItemEstoque): number => (item.qtdeEstoque ?? 0) - (item.qtdeReservada ?? 0)

/**
 * Confere que o cliente foi informado, existe, está ativo e tem endereço
 * principal; registra o erro correspondente em req.
 * @returns endereço principal, ou null
 */
async function validarCliente(req: Request, clienteID: string | null | undefined): Promise<EnderecoPrincipal | null> {
  if (!clienteID) {
    erro(req, 400, 'CAMPO_OBRIGATORIO', { campo: 'Cliente' }, 'cliente_ID')
    return null
  }
  const cliente = await SELECT.one.from(Clientes, clienteID).columns('clienteAtivo')
  if (!cliente || !cliente.clienteAtivo) {
    erro(req, 409, 'CLIENTE_INATIVO', {}, 'cliente_ID')
    return null
  }
  const endereco = await enderecoPrincipal(clienteID)
  if (!endereco) erro(req, 409, 'CLIENTE_SEM_ENDERECO_PRINCIPAL', {}, 'cliente_ID')
  return endereco
}

/**
 * Registro do pedido (Save do rascunho novo, criação direta ou importação).
 * Valida cliente, endereço, itens e disponibilidade; gera o número; fixa
 * preços e total; reserva o estoque. Altera req.data (payload profundo).
 * @param req CREATE de Pedidos com os itens
 */
export async function registrarPedido(req: Request<Pedido>): Promise<void> {
  const pedido = req.data
  removerCamposControlados(pedido)

  const endereco = await validarCliente(req, pedido.cliente_ID)
  const itens: ItemPedido[] = pedido.itens ?? []
  if (!itens.length) erro(req, 400, 'PEDIDO_SEM_ITENS')

  const quantidades = somarQuantidades(itens)
  const estoque = await carregarItens([...quantidades.keys()])
  validarLinhas(req, itens, estoque, new Set(quantidades.keys()))
  for (const [ID, qtde] of quantidades) {
    const item = estoque.get(ID)
    if (item && item.itemAtivo && qtde > disponivel(item)) {
      erro(req, 409, 'ITEM_ESTOQUE_INSUFICIENTE', { sku: item.sku, disponivel: disponivel(item) })
    }
  }
  if (req.errors || !endereco) return

  pedido.valorTotal = precificar(itens, estoque, new Map())
  pedido.currency_code = MOEDA_PADRAO
  pedido.statusPedido_code = STATUS.aberto
  pedido.statusPagamento_code = STATUS_PAGAMENTO.pendente
  pedido.endereco_ID = endereco.ID
  pedido.enderecoPrincipalCompleto = endereco.completo
  pedido.numeroPedido = await proximoNumeroPedido()

  if (await movimentarEstoque(req, MOVIMENTO.reservar, quantidades)) {
    info(req, 'PEDIDO_CONFIRMADO', { numero: pedido.numeroPedido })
  }
}

/**
 * Save da edição de um pedido ABERTO (só os itens e a observação mudam).
 * Reserva apenas o acréscimo e libera o excedente, inclusive de itens
 * removidos. Itens que já estavam no pedido mantêm o preço fixado; itens
 * novos pegam o preço atual.
 * @param req UPDATE de Pedidos (payload profundo)
 */
export async function atualizarPedidoAberto(req: Request<Pedido>, pedidoID: string): Promise<unknown> {
  const pedido = req.data
  const atual = await SELECT.one.from(Pedidos, pedidoID)
  if (!atual) return erro(req, 404, 'PEDIDO_STATUS_INVALIDO', { status: '?' })
  if (atual.statusPedido_code !== STATUS.aberto) return erro(req, 409, 'PEDIDO_EDICAO_BLOQUEADA')
  if (pedido.cliente_ID && pedido.cliente_ID !== atual.cliente_ID) {
    return erro(req, 409, 'PEDIDO_CLIENTE_IMUTAVEL', {}, 'cliente_ID')
  }
  removerCamposControlados(pedido)
  if (!pedido.itens) return // só campos do cabeçalho (ex.: observação)

  const itens: ItemPedido[] = pedido.itens
  if (!itens.length) return erro(req, 400, 'PEDIDO_SEM_ITENS')
  const anterior = await reservaAtual(pedidoID)
  const nova = somarQuantidades(itens)
  const reservar = new Map<string, number>()
  const liberar = new Map<string, number>()
  for (const [ID, qtde] of nova) {
    const antes = anterior.get(ID) ?? 0
    if (qtde > antes) reservar.set(ID, qtde - antes)
    else if (qtde < antes) liberar.set(ID, antes - qtde)
  }
  for (const [ID, antes] of anterior) if (!nova.has(ID)) liberar.set(ID, antes)

  const estoque = await carregarItens([...nova.keys()])
  // Item inativo só barra itens novos ou com quantidade maior
  validarLinhas(req, itens, estoque, new Set(reservar.keys()))
  for (const [ID, qtde] of reservar) {
    const item = estoque.get(ID)
    if (item && item.itemAtivo && qtde > disponivel(item)) {
      erro(req, 409, 'ITEM_ESTOQUE_INSUFICIENTE', { sku: item.sku, disponivel: disponivel(item) })
    }
  }
  if (req.errors) return

  const precosFixados = new Map(
    (await SELECT.from(ItensPedido).columns('item_ID', 'precoUnitarioSnapshot').where({ pedido_ID: pedidoID }))
      .map(l => [l.item_ID!, l.precoUnitarioSnapshot ?? 0])
  )
  pedido.valorTotal = precificar(itens, estoque, precosFixados)
  if (liberar.size && !(await movimentarEstoque(req, MOVIMENTO.liberar, liberar))) return
  if (reservar.size && !(await movimentarEstoque(req, MOVIMENTO.reservar, reservar))) return
  if (reservar.size || liberar.size) info(req, 'PEDIDO_ATUALIZADO', { numero: atual.numeroPedido })
}

/**
 * Valida as linhas do pedido: item informado, item ativo, quantidade
 * positiva e moeda padrão. Registra os erros em req.
 * @param itens linhas do pedido
 * @param estoque itens carregados por ID
 * @param idsQueReservam itens que vão reservar estoque: só
 *   eles são barrados quando inativos (um item já reservado pode ficar)
 */
function validarLinhas(req: Request, itens: ItemPedido[], estoque: Map<string, ItemEstoque>, idsQueReservam: Set<string>): void {
  for (const linha of itens) {
    const item = linha.item_ID ? estoque.get(linha.item_ID) : undefined
    if (!linha.item_ID) erro(req, 400, 'CAMPO_OBRIGATORIO', { campo: 'Item' })
    else if ((!item || !item.itemAtivo) && idsQueReservam.has(linha.item_ID)) {
      erro(req, 409, 'ITEM_INATIVO', { sku: item?.sku ?? '?' })
    } else if (!(Number(linha.qtdeItemPedido) > 0)) erro(req, 400, 'ITEM_QTDE_INVALIDA')
    else if (item && item.currency_code !== MOEDA_PADRAO) erro(req, 400, 'VALOR_INVALIDO', { campo: 'Moeda do item' })
  }
}

/**
 * Fixa preço, moeda e total de cada linha (altera as linhas).
 * @param itens linhas do pedido
 * @param estoque itens carregados por ID (preço atual)
 * @param precosFixados item_ID -> preço já fixado no pedido
 * @returns total do pedido
 */
function precificar(itens: ItemPedido[], estoque: Map<string, ItemEstoque>, precosFixados: Map<string, number>): number {
  let total = 0
  for (const linha of itens) {
    const ID = linha.item_ID ?? ''
    const preco = precosFixados.get(ID) ?? estoque.get(ID)?.precoUnitario ?? 0
    linha.precoUnitarioSnapshot = preco
    linha.currency_code = MOEDA_PADRAO
    linha.valorTotal = arredondar(Number(linha.qtdeItemPedido) * Number(preco))
    total += linha.valorTotal
  }
  return arredondar(total)
}

/**
 * Grava as cópias imutáveis do cliente/endereço e dos itens do pedido, para
 * que o pedido encerrado não mude quando os cadastros mudarem. Só uma vez
 * por pedido: se já houver snapshot, apenas informa.
 * @param pedido pedido gravado (ID, cliente_ID, endereco_ID...)
 */
export async function criarSnapshots(req: Request, pedido: Pedido, motivo: MotivoSnapshot): Promise<void> {
  const existente = await SELECT.one.from(PedidosClienteSnapshots).columns('ID').where({ pedido_ID: pedido.ID })
  if (existente) {
    info(req, 'SNAPSHOT_EXISTENTE')
    return
  }
  const cliente = await SELECT.one.from(Clientes, pedido.cliente_ID!)
    .columns('cpf', 'nome', 'email', 'telefone', 'genero_code', 'dataNascimento', 'clienteAtivo', 'scoreCliente')
  const endereco = pedido.endereco_ID
    ? await SELECT.one.from(Enderecos, pedido.endereco_ID)
      .columns('ID', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'estado')
    : null
  await INSERT.into(PedidosClienteSnapshots).entries({
    pedido_ID: pedido.ID,
    cliente_ID: pedido.cliente_ID,
    cpf: cliente?.cpf,
    nome: cliente?.nome,
    email: cliente?.email,
    telefone: cliente?.telefone,
    genero_code: cliente?.genero_code,
    dataNascimento: cliente?.dataNascimento,
    clienteAtivo: cliente?.clienteAtivo,
    scoreCliente: cliente?.scoreCliente,
    endereco_ID: endereco?.ID,
    cep: endereco?.cep,
    logradouro: endereco?.logradouro,
    numero: endereco?.numero,
    complemento: endereco?.complemento,
    bairro: endereco?.bairro,
    cidade: endereco?.cidade,
    uf: endereco?.uf,
    estado: endereco?.estado,
    enderecoCompleto: pedido.enderecoPrincipalCompleto,
    motivoSnapshot: motivo
  })

  const linhas = await SELECT.from(ItensPedido)
    .columns('ID', 'item_ID', 'qtdeItemPedido', 'currency_code', 'precoUnitarioSnapshot', 'valorTotal')
    .where({ pedido_ID: pedido.ID })
  if (!linhas.length) return
  const mestres = new Map(
    (await SELECT.from(Itens).columns('ID', 'sku', 'nome', 'descricao', 'categoria_code')
      .where({ ID: { in: linhas.map(l => l.item_ID) } })).map(i => [i.ID, i])
  )
  await INSERT.into(PedidosItensSnapshots).entries(linhas.map(l => {
    const m = mestres.get(l.item_ID!)
    return {
      pedido_ID: pedido.ID,
      itemPedido_ID: l.ID,
      item_ID: l.item_ID,
      sku: m?.sku,
      nome: m?.nome,
      descricao: m?.descricao,
      categoria_code: m?.categoria_code,
      quantidade: l.qtdeItemPedido,
      currency_code: l.currency_code,
      precoUnitario: l.precoUnitarioSnapshot,
      valorTotal: l.valorTotal
    }
  }))
}

/**
 * Lê o pedido ativo para as ações do ciclo de vida. Recusa pedido
 * inexistente ou com rascunho de edição aberto (a ação não pode concorrer
 * com uma edição em andamento).
 * @returns o pedido, ou null com o erro registrado
 */
export async function lerPedidoParaAcao(req: Request, pedidoID: string): Promise<Pedido | null> {
  const pedido = await SELECT.one.from(Pedidos, pedidoID)
  if (!pedido) {
    erro(req, 404, 'PEDIDO_STATUS_INVALIDO', { status: '?' })
    return null
  }
  if (await SELECT.one.from(PedidosServico.drafts).columns('ID').where({ ID: pedidoID })) {
    erro(req, 409, 'PEDIDO_EM_EDICAO', { numero: pedido.numeroPedido })
    return null
  }
  return pedido
}

/**
 * Libera toda a reserva de estoque do pedido.
 * @returns true se toda a reserva foi liberada
 */
export async function liberarReservaDoPedido(req: Request, pedidoID: string): Promise<boolean> {
  return movimentarEstoque(req, MOVIMENTO.liberar, await reservaAtual(pedidoID))
}

/**
 * Cancelamento (action cancelarPedido) de pedido ABERTO ou
 * AGUARDANDO_APROVACAO, com motivo obrigatório. Sem pagamento aprovado:
 * libera a reserva, gera os snapshots e cancela. Com pagamento aprovado:
 * abre a solicitação de reembolso (o estoque segue reservado até a decisão).
 * @param pedido pedido lido por lerPedidoParaAcao
 * @param motivo motivo do cancelamento
 */
export async function cancelarPedido(req: Request, pedido: Pedido, motivo: string | null | undefined): Promise<unknown> {
  if (pedido.statusPedido_code !== STATUS.aberto && pedido.statusPedido_code !== STATUS.aguardandoAprovacao) {
    return erroStatus(req, pedido)
  }
  const motivoLimpo = String(motivo ?? '').trim()
  if (!motivoLimpo) return erro(req, 400, 'PEDIDO_MOTIVO_CANCEL_OBRIG', {}, 'motivoCancelamento')

  if (pedido.statusPagamento_code === STATUS_PAGAMENTO.aprovado) {
    return iniciarReembolso(req, pedido, motivoLimpo)
  }
  if (!(await liberarReservaDoPedido(req, pedido.ID!))) return
  await criarSnapshots(req, pedido, 'CANCELAMENTO')
  await UPDATE(Pedidos, pedido.ID!).with({
    statusPedido_code: STATUS.cancelado,
    motivoCancelamento: motivoLimpo,
    dataCancelamento: new Date().toISOString(),
    canceladoPor: req.user.id
  })
  info(req, 'PEDIDO_CANCELADO', { numero: pedido.numeroPedido })
}

/**
 * Abre a solicitação de reembolso (PENDENTE) e põe o pedido em
 * PROCESSANDO_REEMBOLSO, guardando o status anterior para o caso de rejeição.
 * @param motivo motivo do cancelamento
 */
async function iniciarReembolso(req: Request, pedido: Pedido, motivo: string): Promise<void> {
  await INSERT.into(Reembolsos).entries({
    pedido_ID: pedido.ID,
    numeroPedido: pedido.numeroPedido,
    cliente_ID: pedido.cliente_ID,
    statusReembolso_code: 'PENDENTE',
    statusPedidoAnterior_code: pedido.statusPedido_code,
    currency_code: pedido.currency_code,
    valorReembolso: pedido.valorTotal,
    motivoSolicitacao: motivo,
    dataSolicitacao: new Date().toISOString(),
    solicitadoPor: req.user.id
  })
  await UPDATE(Pedidos, pedido.ID!).with({
    statusPedido_code: STATUS.processandoReembolso,
    motivoCancelamento: motivo
  })
  info(req, 'PEDIDO_REEMBOLSO_SOLICITADO', { numero: pedido.numeroPedido })
}

/**
 * Reembolso aprovado: libera a reserva, gera os snapshots, cancela o pedido
 * e marca o pagamento como devolvido (no pedido e no registro de pagamento).
 */
export async function cancelarPorReembolso(req: Request, pedidoID: string): Promise<unknown> {
  const pedido = await SELECT.one.from(Pedidos, pedidoID)
  if (!pedido || pedido.statusPedido_code !== STATUS.processandoReembolso) {
    return erroStatus(req, pedido ?? { statusPedido_code: null })
  }
  if (!(await liberarReservaDoPedido(req, pedidoID))) return
  await criarSnapshots(req, pedido, 'CANCELAMENTO')
  await UPDATE(Pedidos, pedidoID).with({
    statusPedido_code: STATUS.cancelado,
    statusPagamento_code: STATUS_PAGAMENTO.devolvido,
    dataCancelamento: new Date().toISOString(),
    canceladoPor: req.user.id
  })
  await UPDATE(Pagamentos).with({ statusPagamento_code: STATUS_PAGAMENTO.devolvido }).where({ pedido_ID: pedidoID })
  return pedido
}

/**
 * Reembolso rejeitado: o pedido volta ao status anterior à solicitação e o
 * motivo do cancelamento é limpo.
 * @param statusAnterior status guardado na solicitação
 */
export async function retomarPedido(req: Request, pedidoID: string, statusAnterior: string | null | undefined): Promise<unknown> {
  const pedido = await SELECT.one.from(Pedidos, pedidoID)
  if (!pedido || pedido.statusPedido_code !== STATUS.processandoReembolso) {
    return erroStatus(req, pedido ?? { statusPedido_code: null })
  }
  if (!statusAnterior) return erro(req, 400, 'CAMPO_OBRIGATORIO', { campo: 'Status anterior' })
  await UPDATE(Pedidos, pedidoID).with({ statusPedido_code: statusAnterior as StatusPedido_code, motivoCancelamento: null })
  return pedido
}

/**
 * Grava o resultado seguro do pagamento, substituindo a tentativa anterior
 * (só a última tentativa fica registrada). Nenhum dado sensível do cartão
 * chega aqui.
 * @param resultado resultado de simularPagamento com dadosValidos true
 */
export async function gravarPagamento(pedidoID: string, resultado: PagamentoProcessado): Promise<void> {
  await DELETE.from(Pagamentos).where({ pedido_ID: pedidoID })
  await INSERT.into(Pagamentos).entries({
    pedido_ID: pedidoID,
    metodoPagamento_code: resultado.metodo,
    statusPagamento_code: resultado.status,
    bandeiraCartao: resultado.bandeira,
    ultimos4DigitosCartao: resultado.ultimos4,
    cartaoMascarado: resultado.cartaoMascarado,
    codigoAutorizacao: resultado.codigoAutorizacao,
    mensagemPagamento: resultado.mensagem,
    dataPagamento: new Date().toISOString()
  })
}
