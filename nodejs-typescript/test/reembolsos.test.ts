/**
 * Gestão de Reembolsos (equivalente a ltcl_reembolso do RAP).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { iniciarServidor, falha, COMUM } from './apoio/contexto.js'

const api = iniciarServidor()
const R = '/odata/v4/reembolsos'
const P = '/odata/v4/pedidos'
const E = '/odata/v4/estoque'

/** Pedido pago e cancelado: devolve { pedido, reembolso, item, qtde }. */
async function solicitacao() {
  const { data: cliente } = await api.get(`${P}/ClientesAtivos?$top=1&$skip=5`)
  const { data: itens } = await api.get(`${P}/ItensAtivos?$filter=qtdeDisponivel ge 20&$top=1`)
  const item = itens.value[0]
  const { data: novo } = await api.post(`${P}/Pedidos`, {})
  await api.patch(`${P}/Pedidos${api.chave(novo.ID, false)}`, { cliente_ID: cliente.value[0].ID })
  const { data: linha } = await api.post(`${P}/Pedidos${api.chave(novo.ID, false)}/itens`, {})
  await api.patch(`${P}/ItensPedido${api.chave(linha.ID, false)}`, { item_ID: item.ID, qtdeItemPedido: 2 })
  const pedido = await api.ativar(P, 'Pedidos', novo.ID)
  await api.post(`${P}/Pedidos${api.chave(pedido.ID)}/PedidosService.efetuarPagamento`,
    { metodoPagamento: 'CARTAO_DEBITO', numeroCartao: '5500000000000004', validade: '10/40', cvv: '321' })
  await api.post(`${P}/Pedidos${api.chave(pedido.ID)}/PedidosService.cancelarPedido`, { motivoCancelamento: 'Atraso na entrega' })
  const { data } = await api.get(`${R}/Reembolsos?$filter=pedido_ID eq ${pedido.ID}`)
  return { pedido, reembolso: data.value[0], item }
}

const reservado = async (itemID: string) => (await api.get(`${E}/Itens${api.chave(itemID)}?$select=qtdeReservada`)).data.qtdeReservada
const pedidoAtual = async (ID: string) => (await api.get(`${P}/Pedidos${api.chave(ID)}?$expand=pagamento,clienteSnapshot`)).data

describe('Gestão de Reembolsos', () => {
  it('aprovar cancela o pedido, devolve o pagamento, libera a reserva e gera snapshots', async () => {
    const { pedido, reembolso, item } = await solicitacao()
    assert.equal(reembolso.statusReembolso_code, 'PENDENTE')
    assert.equal(reembolso.nomeCliente.length > 0, true)
    const antes = await reservado(item.ID)

    const { data } = await api.post(`${R}/Reembolsos(${reembolso.ID})/ReembolsosService.aprovarReembolso`, { motivoDecisao: 'Procedente' })
    assert.equal(data.statusReembolso_code, 'APROVADO')
    assert.equal(data.decididoPor, 'admin')
    const atual = await pedidoAtual(pedido.ID)
    assert.equal(atual.statusPedido_code, 'CANCELADO')
    assert.equal(atual.statusPagamento_code, 'DEVOLVIDO')
    assert.equal(atual.pagamento.statusPagamento_code, 'DEVOLVIDO')
    assert.equal(atual.clienteSnapshot.motivoSnapshot, 'CANCELAMENTO')
    assert.equal(await reservado(item.ID), antes - 2)
  })

  it('rejeitar exige motivo e devolve o pedido ao status anterior', async () => {
    const { pedido, reembolso, item } = await solicitacao()
    const antes = await reservado(item.ID)
    const semMotivo = await falha(api.post(`${R}/Reembolsos(${reembolso.ID})/ReembolsosService.rejeitarReembolso`, { motivoDecisao: ' ' }))
    assert.ok(semMotivo.status >= 400)

    const { data } = await api.post(`${R}/Reembolsos(${reembolso.ID})/ReembolsosService.rejeitarReembolso`, { motivoDecisao: 'Fora do prazo' })
    assert.equal(data.statusReembolso_code, 'REJEITADO')
    const atual = await pedidoAtual(pedido.ID)
    assert.equal(atual.statusPedido_code, 'AGUARDANDO_APROVACAO')
    assert.equal(atual.motivoCancelamento, null)
    assert.equal(await reservado(item.ID), antes)
  })

  it('solicitação já decidida não pode ser decidida de novo', async () => {
    const { reembolso } = await solicitacao()
    await api.post(`${R}/Reembolsos(${reembolso.ID})/ReembolsosService.rejeitarReembolso`, { motivoDecisao: 'Não procede' })
    const erro = await falha(api.post(`${R}/Reembolsos(${reembolso.ID})/ReembolsosService.aprovarReembolso`, {}))
    assert.match(erro.message, /não está mais pendente/)
  })

  it('o usuário comum também decide reembolsos; a lista é somente leitura', async () => {
    const { reembolso } = await solicitacao()
    const { data } = await api.post(`${R}/Reembolsos(${reembolso.ID})/ReembolsosService.aprovarReembolso`, {}, COMUM)
    assert.equal(data.statusReembolso_code, 'APROVADO')
    assert.ok((await falha(api.post(`${R}/Reembolsos`, { numeroPedido: 'x' }))).status >= 400)
  })
})
