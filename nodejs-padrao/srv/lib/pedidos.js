/**
 * Regras de domínio do pedido, compartilhadas pelos serviços de Pedidos e de
 * Reembolsos e pela importação por planilha: registro do pedido com reserva
 * de estoque, edição dos itens com reserva pela diferença, snapshots,
 * cancelamento, gravação do pagamento e as operações acionadas pela decisão
 * de reembolso (cancelarPorReembolso e retomarPedido).
 *
 * Todas as funções rodam na transação da requisição: se qualquer passo
 * reporta erro (req.error), o CAP desfaz tudo ao final do handler.
 *
 * Concorrência: toda ação começa pela transição de status (transicionarPedido),
 * um UPDATE condicional ao status lido. De duas operações simultâneas sobre o
 * mesmo pedido só a primeira muda o status; a outra é recusada antes de mexer
 * no estoque, no pagamento ou nos snapshots.
 */
import cds from '@sap/cds'
import { erro, aviso, info } from './mensagens.js'
import { movimentarEstoque, MOVIMENTO } from './estoque.js'
import { proximoNumeroPedido } from './numeracao.js'
import { simularPagamento } from './pagamento-simulado.js'
import { arredondar, formatarEndereco, somarQuantidades } from './util.js'

const { SELECT, INSERT, UPDATE, DELETE } = cds.ql

/** Códigos de StatusPedido usados nas regras. */
export const STATUS = Object.freeze({
  aberto: 'ABERTO',
  aguardandoAprovacao: 'AGUARDANDO_APROVACAO',
  processandoReembolso: 'PROCESSANDO_REEMBOLSO',
  cancelado: 'CANCELADO',
  finalizado: 'FINALIZADO'
})

/** Códigos de StatusPagamento usados nas regras. */
export const STATUS_PAGAMENTO = Object.freeze({
  pendente: 'PENDENTE',
  aprovado: 'APROVADO',
  recusado: 'RECUSADO',
  devolvido: 'DEVOLVIDO'
})

/** Moeda dos pedidos: itens em outra moeda não podem ser pedidos. */
export const MOEDA_PADRAO = 'BRL'

/** Campos do pedido mantidos só pelo backend (nunca vêm da UI). */
export const CAMPOS_CONTROLADOS = [
  'numeroPedido', 'statusPedido_code', 'statusPagamento_code', 'endereco_ID', 'enderecoPrincipalCompleto',
  'valorTotal', 'currency_code', 'dataFinalizacao', 'motivoCancelamento', 'dataCancelamento', 'canceladoPor',
  'referenciaImportacao'
]

/** Entidades do banco (resolvidas na chamada, depois que o modelo foi carregado). */
const db = () => cds.entities('pedidoscompras')

/**
 * Remove do payload os campos que só o backend mantém.
 * @param {object} pedido dados do pedido (alterados)
 */
export function removerCamposControlados(pedido) {
  for (const campo of CAMPOS_CONTROLADOS) delete pedido[campo]
}

/**
 * Endereço principal atual do cliente, com o texto completo formatado.
 * @param {string|null|undefined} clienteID
 * @returns {Promise<{ID:string, completo:string}|null>} null se não houver cliente ou endereço principal
 */
export async function enderecoPrincipal(clienteID) {
  if (!clienteID) return null
  const end = await SELECT.one.from(db().Enderecos)
    .columns('ID', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf')
    .where({ cliente_ID: clienteID, principal: true })
  return end ? { ID: end.ID, completo: formatarEndereco(end) } : null
}

/**
 * Quantidades já reservadas pelo pedido, lidas dos itens gravados (não do rascunho).
 * @param {string} pedidoID
 * @returns {Promise<Map<string, number>>} item_ID -> quantidade
 */
export async function reservaAtual(pedidoID) {
  const linhas = await SELECT.from(db().ItensPedido).columns('item_ID', 'qtdeItemPedido').where({ pedido_ID: pedidoID })
  return somarQuantidades(linhas)
}

/**
 * Registra a mensagem de ação não permitida no status atual do pedido
 * (pedido finalizado, cancelado ou outro status).
 * @param {import('@sap/cds').Request} req
 * @param {{statusPedido_code?:string|null}} pedido
 * @returns {Error}
 */
export function erroStatus(req, pedido) {
  if (pedido.statusPedido_code === STATUS.finalizado) return erro(req, 409, 'PEDIDO_FINALIZADO_IMUTAVEL')
  if (pedido.statusPedido_code === STATUS.cancelado) return erro(req, 409, 'PEDIDO_CANCELADO_IMUTAVEL')
  return erro(req, 409, 'PEDIDO_STATUS_INVALIDO', { status: pedido.statusPedido_code })
}

/**
 * Transição atômica do pedido: grava `dados` só se o pedido continua com o
 * status e o status de pagamento lidos no início da ação. A condição é
 * avaliada pelo banco no UPDATE, que também bloqueia a linha até o fim da
 * transação; por isso deve ser a primeira gravação da ação.
 * @param {import('@sap/cds').Request} req requisição que recebe o erro
 * @param {{ID:string, numeroPedido?:string, statusPedido_code:string, statusPagamento_code:string}} pedido estado lido
 * @param {object} dados campos a gravar
 * @returns {Promise<boolean>} false, com PEDIDO_ALTERADO_CONCORRENTE registrado, se outra operação mudou o pedido
 */
export async function transicionarPedido(req, pedido, dados) {
  const alterados = await UPDATE(db().Pedidos).with(dados).where({
    ID: pedido.ID,
    statusPedido_code: pedido.statusPedido_code,
    statusPagamento_code: pedido.statusPagamento_code
  })
  if (alterados === 1) return true
  erro(req, 409, 'PEDIDO_ALTERADO_CONCORRENTE', { numero: pedido.numeroPedido })
  return false
}

/**
 * Itens do estoque por ID, com os campos usados no registro e na edição.
 * @param {string[]} ids
 * @returns {Promise<Map<string, object>>} ID -> item
 */
async function carregarItens(ids) {
  if (!ids.length) return new Map()
  const linhas = await SELECT.from(db().Itens)
    .columns('ID', 'sku', 'itemAtivo', 'precoUnitario', 'currency_code', 'qtdeEstoque', 'qtdeReservada')
    .where({ ID: { in: ids } })
  return new Map(linhas.map(i => [i.ID, i]))
}

/**
 * Confere que o cliente foi informado, existe, está ativo e tem endereço
 * principal; registra o erro correspondente em req.
 * @param {import('@sap/cds').Request} req
 * @param {string|null|undefined} clienteID
 * @returns {Promise<{ID:string, completo:string}|null>} endereço principal, ou null
 */
async function validarCliente(req, clienteID) {
  if (!clienteID) {
    erro(req, 400, 'CAMPO_OBRIGATORIO', { campo: 'Cliente' }, 'cliente_ID')
    return null
  }
  const cliente = await SELECT.one.from(db().Clientes, clienteID).columns('clienteAtivo')
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
 * @param {import('@sap/cds').Request} req CREATE de Pedidos com os itens
 * @returns {Promise<void>}
 */
export async function registrarPedido(req) {
  const pedido = req.data
  removerCamposControlados(pedido)

  const endereco = await validarCliente(req, pedido.cliente_ID)
  const itens = pedido.itens ?? []
  if (!itens.length) erro(req, 400, 'PEDIDO_SEM_ITENS')

  const quantidades = somarQuantidades(itens)
  const estoque = await carregarItens([...quantidades.keys()])
  validarLinhas(req, itens, estoque, new Set(quantidades.keys()))
  for (const [ID, qtde] of quantidades) {
    const item = estoque.get(ID)
    if (item && item.itemAtivo && qtde > item.qtdeEstoque - item.qtdeReservada) {
      erro(req, 409, 'ITEM_ESTOQUE_INSUFICIENTE', { sku: item.sku, disponivel: item.qtdeEstoque - item.qtdeReservada })
    }
  }
  if (req.errors) return

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
 * @param {import('@sap/cds').Request} req UPDATE de Pedidos (payload profundo)
 * @param {string} pedidoID
 */
export async function atualizarPedidoAberto(req, pedidoID) {
  const pedido = req.data
  const atual = await SELECT.one.from(db().Pedidos, pedidoID)
  if (!atual) return erro(req, 404, 'PEDIDO_STATUS_INVALIDO', { status: '?' })
  if (atual.statusPedido_code !== STATUS.aberto) return erro(req, 409, 'PEDIDO_EDICAO_BLOQUEADA')
  if (pedido.cliente_ID && pedido.cliente_ID !== atual.cliente_ID) {
    return erro(req, 409, 'PEDIDO_CLIENTE_IMUTAVEL', {}, 'cliente_ID')
  }
  removerCamposControlados(pedido)
  // Garante que nenhuma ação mudou o status desde a leitura (e bloqueia o pedido)
  if (!(await transicionarPedido(req, atual, { statusPedido_code: STATUS.aberto }))) return
  if (!pedido.itens) return // só campos do cabeçalho (ex.: observação)

  const itens = pedido.itens
  if (!itens.length) return erro(req, 400, 'PEDIDO_SEM_ITENS')
  const anterior = await reservaAtual(pedidoID)
  const nova = somarQuantidades(itens)
  const reservar = new Map()
  const liberar = new Map()
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
    if (item && item.itemAtivo && qtde > item.qtdeEstoque - item.qtdeReservada) {
      erro(req, 409, 'ITEM_ESTOQUE_INSUFICIENTE', { sku: item.sku, disponivel: item.qtdeEstoque - item.qtdeReservada })
    }
  }
  if (req.errors) return

  const precosFixados = new Map(
    (await SELECT.from(db().ItensPedido).columns('item_ID', 'precoUnitarioSnapshot').where({ pedido_ID: pedidoID }))
      .map(l => [l.item_ID, l.precoUnitarioSnapshot])
  )
  pedido.valorTotal = precificar(itens, estoque, precosFixados)
  if (liberar.size && !(await movimentarEstoque(req, MOVIMENTO.liberar, liberar))) return
  if (reservar.size && !(await movimentarEstoque(req, MOVIMENTO.reservar, reservar))) return
  if (reservar.size || liberar.size) info(req, 'PEDIDO_ATUALIZADO', { numero: atual.numeroPedido })
}

/**
 * Valida as linhas do pedido: item informado, item ativo, quantidade
 * positiva e moeda padrão. Registra os erros em req.
 * @param {import('@sap/cds').Request} req
 * @param {object[]} itens linhas do pedido
 * @param {Map<string, object>} estoque itens carregados por ID
 * @param {Set<string>} idsQueReservam itens que vão reservar estoque: só
 *   eles são barrados quando inativos (um item já reservado pode ficar)
 */
function validarLinhas(req, itens, estoque, idsQueReservam) {
  for (const linha of itens) {
    const item = estoque.get(linha.item_ID)
    if (!linha.item_ID) erro(req, 400, 'CAMPO_OBRIGATORIO', { campo: 'Item' })
    else if ((!item || !item.itemAtivo) && idsQueReservam.has(linha.item_ID)) {
      erro(req, 409, 'ITEM_INATIVO', { sku: item?.sku ?? '?' })
    } else if (!(Number(linha.qtdeItemPedido) > 0)) erro(req, 400, 'ITEM_QTDE_INVALIDA')
    else if (item && item.currency_code !== MOEDA_PADRAO) erro(req, 400, 'VALOR_INVALIDO', { campo: 'Moeda do item' })
  }
}

/**
 * Fixa preço, moeda e total de cada linha (altera as linhas).
 * @param {object[]} itens linhas do pedido
 * @param {Map<string, object>} estoque itens carregados por ID (preço atual)
 * @param {Map<string, number>} precosFixados item_ID -> preço já fixado no pedido
 * @returns {number} total do pedido
 */
function precificar(itens, estoque, precosFixados) {
  let total = 0
  for (const linha of itens) {
    const preco = precosFixados.get(linha.item_ID) ?? estoque.get(linha.item_ID)?.precoUnitario ?? 0
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
 * @param {import('@sap/cds').Request} req
 * @param {object} pedido pedido gravado (ID, cliente_ID, endereco_ID...)
 * @param {'FINALIZACAO'|'CANCELAMENTO'} motivo
 * @returns {Promise<void>}
 */
export async function criarSnapshots(req, pedido, motivo) {
  const { PedidosClienteSnapshots, PedidosItensSnapshots, Clientes, Enderecos, Itens, ItensPedido } = db()
  const existente = await SELECT.one.from(PedidosClienteSnapshots).columns('ID').where({ pedido_ID: pedido.ID })
  if (existente) {
    info(req, 'SNAPSHOT_EXISTENTE')
    return
  }
  const cliente = await SELECT.one.from(Clientes, pedido.cliente_ID)
    .columns('cpf', 'nome', 'email', 'telefone', 'genero_code', 'dataNascimento', 'clienteAtivo', 'scoreCliente')
  const endereco = pedido.endereco_ID
    ? await SELECT.one.from(Enderecos, pedido.endereco_ID)
      .columns('ID', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'estado')
    : null
  await INSERT.into(PedidosClienteSnapshots).entries({
    pedido_ID: pedido.ID,
    cliente_ID: pedido.cliente_ID,
    ...cliente,
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
    const m = mestres.get(l.item_ID) ?? {}
    return {
      pedido_ID: pedido.ID,
      itemPedido_ID: l.ID,
      item_ID: l.item_ID,
      sku: m.sku,
      nome: m.nome,
      descricao: m.descricao,
      categoria_code: m.categoria_code,
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
 * @param {import('@sap/cds').Request} req
 * @param {string} pedidoID
 * @returns {Promise<object|null>} o pedido, ou null com o erro registrado
 */
export async function lerPedidoParaAcao(req, pedidoID) {
  const pedido = await SELECT.one.from(db().Pedidos, pedidoID)
  if (!pedido) {
    erro(req, 404, 'PEDIDO_STATUS_INVALIDO', { status: '?' })
    return null
  }
  const emEdicao = cds.model.definitions['PedidosService.Pedidos.drafts']
  if (emEdicao && (await SELECT.one.from(emEdicao).columns('ID').where({ ID: pedidoID }))) {
    erro(req, 409, 'PEDIDO_EM_EDICAO', { numero: pedido.numeroPedido })
    return null
  }
  return pedido
}

/**
 * Libera toda a reserva de estoque do pedido.
 * @param {import('@sap/cds').Request} req
 * @param {string} pedidoID
 * @returns {Promise<boolean>} true se toda a reserva foi liberada
 */
export async function liberarReservaDoPedido(req, pedidoID) {
  return movimentarEstoque(req, MOVIMENTO.liberar, await reservaAtual(pedidoID))
}

/**
 * Pagamento (action efetuarPagamento) de pedido ABERTO. Os dados do cartão
 * ficam só em memória; grava-se apenas o resultado seguro. Aprovado, o pedido
 * vai para AGUARDANDO_APROVACAO; recusado, segue ABERTO para nova tentativa.
 * @param {import('@sap/cds').Request} req
 * @param {object} pedido pedido lido por lerPedidoParaAcao
 * @param {{metodoPagamento?:string, numeroCartao?:string, validade?:string, cvv?:string}} cartao dados digitados
 * @returns {Promise<void>}
 */
export async function efetuarPagamento(req, pedido, { metodoPagamento, numeroCartao, validade, cvv }) {
  if (pedido.statusPedido_code !== STATUS.aberto) return erroStatus(req, pedido)
  const simulacao = simularPagamento({ metodo: metodoPagamento, numero: numeroCartao, validade, cvv })
  if (!simulacao.dadosValidos) return erro(req, 400, 'CARTAO_DADOS_INVALIDOS', { erro: simulacao.erro })

  const aprovado = simulacao.status === STATUS_PAGAMENTO.aprovado
  const mudou = await transicionarPedido(req, pedido, {
    statusPagamento_code: simulacao.status,
    statusPedido_code: aprovado ? STATUS.aguardandoAprovacao : STATUS.aberto
  })
  if (!mudou) return
  await gravarPagamento(pedido.ID, simulacao)
  if (aprovado) info(req, 'PAGAMENTO_APROVADO')
  else aviso(req, 'PAGAMENTO_RECUSADO')
}

/**
 * Aprovação (action aprovarPedido) de pedido AGUARDANDO_APROVACAO com
 * pagamento aprovado: finaliza o pedido, baixa o estoque reservado e gera os
 * snapshots.
 * @param {import('@sap/cds').Request} req
 * @param {object} pedido pedido lido por lerPedidoParaAcao
 * @returns {Promise<void>}
 */
export async function finalizarPedido(req, pedido) {
  if (pedido.statusPedido_code === STATUS.aberto) return erro(req, 409, 'PEDIDO_PAGAMENTO_PENDENTE')
  if (pedido.statusPedido_code !== STATUS.aguardandoAprovacao) return erroStatus(req, pedido)
  if (pedido.statusPagamento_code !== STATUS_PAGAMENTO.aprovado) return erro(req, 409, 'PEDIDO_PAGAMENTO_PENDENTE')

  const finalizado = await transicionarPedido(req, pedido, {
    statusPedido_code: STATUS.finalizado,
    dataFinalizacao: new Date().toISOString()
  })
  if (!finalizado) return
  // Baixa estoque e reserva (a condição no banco confere a reserva)
  if (!(await movimentarEstoque(req, MOVIMENTO.baixar, await reservaAtual(pedido.ID)))) return
  await criarSnapshots(req, pedido, 'FINALIZACAO')
  info(req, 'PEDIDO_FINALIZADO', { numero: pedido.numeroPedido })
}

/**
 * Cancelamento (action cancelarPedido) de pedido ABERTO ou
 * AGUARDANDO_APROVACAO, com motivo obrigatório. Sem pagamento aprovado:
 * libera a reserva, gera os snapshots e cancela. Com pagamento aprovado:
 * abre a solicitação de reembolso (o estoque segue reservado até a decisão).
 * @param {import('@sap/cds').Request} req
 * @param {object} pedido pedido lido por lerPedidoParaAcao
 * @param {string|null|undefined} motivo motivo do cancelamento
 */
export async function cancelarPedido(req, pedido, motivo) {
  if (pedido.statusPedido_code !== STATUS.aberto && pedido.statusPedido_code !== STATUS.aguardandoAprovacao) {
    return erroStatus(req, pedido)
  }
  const motivoLimpo = String(motivo ?? '').trim()
  if (!motivoLimpo) return erro(req, 400, 'PEDIDO_MOTIVO_CANCEL_OBRIG', {}, 'motivoCancelamento')

  if (pedido.statusPagamento_code === STATUS_PAGAMENTO.aprovado) {
    return iniciarReembolso(req, pedido, motivoLimpo)
  }
  const cancelado = await transicionarPedido(req, pedido, {
    statusPedido_code: STATUS.cancelado,
    motivoCancelamento: motivoLimpo,
    dataCancelamento: new Date().toISOString(),
    canceladoPor: req.user.id
  })
  if (!cancelado) return
  if (!(await liberarReservaDoPedido(req, pedido.ID))) return
  await criarSnapshots(req, pedido, 'CANCELAMENTO')
  info(req, 'PEDIDO_CANCELADO', { numero: pedido.numeroPedido })
}

/**
 * Abre a solicitação de reembolso (PENDENTE) e põe o pedido em
 * PROCESSANDO_REEMBOLSO, guardando o status anterior para o caso de rejeição.
 * @param {import('@sap/cds').Request} req
 * @param {object} pedido
 * @param {string} motivo motivo do cancelamento
 * @returns {Promise<void>}
 */
async function iniciarReembolso(req, pedido, motivo) {
  const mudou = await transicionarPedido(req, pedido, {
    statusPedido_code: STATUS.processandoReembolso,
    motivoCancelamento: motivo
  })
  if (!mudou) return
  await INSERT.into(db().Reembolsos).entries({
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
  info(req, 'PEDIDO_REEMBOLSO_SOLICITADO', { numero: pedido.numeroPedido })
}

/**
 * Reembolso aprovado: libera a reserva, gera os snapshots, cancela o pedido
 * e marca o pagamento como devolvido (no pedido e no registro de pagamento).
 * @param {import('@sap/cds').Request} req
 * @param {string} pedidoID
 */
export async function cancelarPorReembolso(req, pedidoID) {
  const pedido = await SELECT.one.from(db().Pedidos, pedidoID)
  if (!pedido || pedido.statusPedido_code !== STATUS.processandoReembolso) {
    return erroStatus(req, pedido ?? { statusPedido_code: '?' })
  }
  const cancelado = await transicionarPedido(req, pedido, {
    statusPedido_code: STATUS.cancelado,
    statusPagamento_code: STATUS_PAGAMENTO.devolvido,
    dataCancelamento: new Date().toISOString(),
    canceladoPor: req.user.id
  })
  if (!cancelado) return
  if (!(await liberarReservaDoPedido(req, pedidoID))) return
  await criarSnapshots(req, pedido, 'CANCELAMENTO')
  await UPDATE(db().Pagamentos).with({ statusPagamento_code: STATUS_PAGAMENTO.devolvido }).where({ pedido_ID: pedidoID })
  return pedido
}

/**
 * Reembolso rejeitado: o pedido volta ao status anterior à solicitação e o
 * motivo do cancelamento é limpo.
 * @param {import('@sap/cds').Request} req
 * @param {string} pedidoID
 * @param {string|null|undefined} statusAnterior status guardado na solicitação
 */
export async function retomarPedido(req, pedidoID, statusAnterior) {
  const pedido = await SELECT.one.from(db().Pedidos, pedidoID)
  if (!pedido || pedido.statusPedido_code !== STATUS.processandoReembolso) {
    return erroStatus(req, pedido ?? { statusPedido_code: '?' })
  }
  if (!statusAnterior) return erro(req, 400, 'CAMPO_OBRIGATORIO', { campo: 'Status anterior' })
  if (!(await transicionarPedido(req, pedido, { statusPedido_code: statusAnterior, motivoCancelamento: null }))) return
  return pedido
}

/**
 * Grava o resultado seguro do pagamento, substituindo a tentativa anterior
 * (só a última tentativa fica registrada). Nenhum dado sensível do cartão
 * chega aqui.
 * @param {string} pedidoID
 * @param {object} resultado resultado de simularPagamento com dadosValidos true
 * @returns {Promise<void>}
 */
export async function gravarPagamento(pedidoID, resultado) {
  const { Pagamentos } = db()
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
