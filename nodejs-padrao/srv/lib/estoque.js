/**
 * Movimentação de estoque: reserva, liberação e baixa.
 *
 * Equivale às actions internas ReservarEstoque / LiberarReserva / BaixarEstoque
 * do BO Item no RAP. Não são expostas em nenhum serviço: só o domínio de
 * pedidos chama estas funções, sempre dentro da transação da requisição.
 *
 * Concorrência: cada movimento é um UPDATE condicional e atômico ("só reserva
 * se o saldo disponível no banco ainda cobre a quantidade"). Se a condição não
 * vale mais (outra transação consumiu o saldo), nenhuma linha é alterada e o
 * pedido recebe o erro correspondente. Como a requisição inteira roda numa
 * transação, qualquer erro desfaz também os movimentos já aplicados.
 */
import cds from '@sap/cds'
import { erro } from './mensagens.js'

const { SELECT, UPDATE } = cds.ql

export const MOVIMENTO = Object.freeze({ reservar: 'reservar', liberar: 'liberar', baixar: 'baixar' })

/**
 * Aplica os movimentos e reporta os problemas em req (req.error).
 * @param {import('@sap/cds').Request} req
 * @param {'reservar'|'liberar'|'baixar'} tipo
 * @param {Map<string, number>} quantidades item_ID -> quantidade
 * @returns {Promise<boolean>} true se todos os movimentos foram aplicados
 */
export async function movimentarEstoque(req, tipo, quantidades) {
  const { Itens } = cds.entities('pedidoscompras')
  let ok = true
  for (const [ID, qtde] of quantidades) {
    if (!(qtde > 0)) {
      erro(req, 400, 'ITEM_QTDE_INVALIDA')
      ok = false
      continue
    }
    const alterados = await condicao(UPDATE(Itens).with(expressoes(tipo, qtde)), tipo, ID, qtde)
    if (alterados === 1) continue

    ok = false
    const item = await SELECT.one.from(Itens, ID).columns('sku', 'itemAtivo', 'qtdeEstoque', 'qtdeReservada')
    const sku = item?.sku ?? '?'
    if (!item) erro(req, 409, 'ITEM_ESTOQUE_CONCORRENTE', { sku })
    else if (tipo === MOVIMENTO.reservar && !item.itemAtivo) erro(req, 409, 'ITEM_INATIVO', { sku })
    else if (tipo === MOVIMENTO.reservar) {
      erro(req, 409, 'ITEM_ESTOQUE_INSUFICIENTE', { sku, disponivel: item.qtdeEstoque - item.qtdeReservada })
    } else erro(req, 409, 'ITEM_RESERVA_INCONSISTENTE', { sku })
  }
  return ok
}

function expressoes(tipo, qtde) {
  switch (tipo) {
    case MOVIMENTO.reservar:
      return { qtdeReservada: { '+=': qtde } }
    case MOVIMENTO.liberar:
      return { qtdeReservada: { '-=': qtde } }
    case MOVIMENTO.baixar:
      return { qtdeReservada: { '-=': qtde }, qtdeEstoque: { '-=': qtde } }
    default:
      throw new Error(`Movimento de estoque desconhecido: ${tipo}`)
  }
}

/** Condição avaliada no banco no momento do UPDATE (saldo atual, não o da UI). */
function condicao(consulta, tipo, ID, qtde) {
  switch (tipo) {
    case MOVIMENTO.reservar:
      return consulta.where`ID = ${ID} and itemAtivo = true and qtdeEstoque - qtdeReservada >= ${qtde}`
    case MOVIMENTO.liberar:
      return consulta.where`ID = ${ID} and qtdeReservada >= ${qtde}`
    case MOVIMENTO.baixar:
      return consulta.where`ID = ${ID} and qtdeReservada >= ${qtde} and qtdeEstoque >= ${qtde}`
    default:
      throw new Error(`Movimento de estoque desconhecido: ${tipo}`)
  }
}
