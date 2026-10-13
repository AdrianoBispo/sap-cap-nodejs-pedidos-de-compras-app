/**
 * Movimentação de estoque: reserva, liberação e baixa.
 *
 * Não são expostas em nenhum serviço: só o domínio de pedidos chama estas
 * funções, sempre dentro da transação da requisição.
 *
 * Concorrência: cada movimento é um UPDATE condicional e atômico ("só reserva
 * se o saldo disponível no banco ainda cobre a quantidade"). Se a condição não
 * vale mais (outra transação consumiu o saldo), nenhuma linha é alterada e o
 * pedido recebe o erro correspondente. Como a requisição inteira roda numa
 * transação, qualquer erro desfaz também os movimentos já aplicados.
 */
import type { Request } from '@sap/cds'
import { Itens } from '#cds-models/pedidoscompras'
import { erro } from './mensagens.js'

/**
 * Tipos de movimento: reservar (registro/edição do pedido), liberar
 * (cancelamento/edição) e baixar (aprovação do pedido).
 */
export const MOVIMENTO = Object.freeze({ reservar: 'reservar', liberar: 'liberar', baixar: 'baixar' } as const)
export type Movimento = typeof MOVIMENTO[keyof typeof MOVIMENTO]

/**
 * Aplica os movimentos item a item e reporta os problemas em req (req.error).
 * Quando o banco recusa um movimento, o motivo é diagnosticado (item
 * inexistente, inativo, saldo insuficiente ou reserva inconsistente).
 * @param req requisição que recebe os erros
 * @param tipo movimento a aplicar
 * @param quantidades item_ID -> quantidade
 * @returns true se todos os movimentos foram aplicados
 */
export async function movimentarEstoque(req: Request, tipo: Movimento, quantidades: Map<string, number>): Promise<boolean> {
  let ok = true
  for (const [ID, qtde] of quantidades) {
    if (!(qtde > 0)) {
      erro(req, 400, 'ITEM_QTDE_INVALIDA')
      ok = false
      continue
    }
    const alterados = await atualizar(tipo, ID, qtde)
    if (alterados === 1) continue

    ok = false
    const item = await SELECT.one.from(Itens, ID).columns('sku', 'itemAtivo', 'qtdeEstoque', 'qtdeReservada')
    const sku = item?.sku ?? '?'
    if (!item) erro(req, 409, 'ITEM_ESTOQUE_CONCORRENTE', { sku })
    else if (tipo === MOVIMENTO.reservar && !item.itemAtivo) erro(req, 409, 'ITEM_INATIVO', { sku })
    else if (tipo === MOVIMENTO.reservar) {
      erro(req, 409, 'ITEM_ESTOQUE_INSUFICIENTE', { sku, disponivel: (item.qtdeEstoque ?? 0) - (item.qtdeReservada ?? 0) })
    } else erro(req, 409, 'ITEM_RESERVA_INCONSISTENTE', { sku })
  }
  return ok
}

/**
 * UPDATE com a condição avaliada no banco no momento da gravação (saldo
 * atual, não o da UI). Devolve o número de linhas alteradas (0 ou 1).
 */
async function atualizar(tipo: Movimento, ID: string, qtde: number): Promise<number> {
  switch (tipo) {
    case MOVIMENTO.reservar:
      return await UPDATE(Itens).with({ qtdeReservada: { '+=': qtde } })
        .where`ID = ${ID} and itemAtivo = true and qtdeEstoque - qtdeReservada >= ${qtde}`
    case MOVIMENTO.liberar:
      return await UPDATE(Itens).with({ qtdeReservada: { '-=': qtde } })
        .where`ID = ${ID} and qtdeReservada >= ${qtde}`
    case MOVIMENTO.baixar:
      return await UPDATE(Itens).with({ qtdeReservada: { '-=': qtde }, qtdeEstoque: { '-=': qtde } })
        .where`ID = ${ID} and qtdeReservada >= ${qtde} and qtdeEstoque >= ${qtde}`
    default:
      throw new Error(`Movimento de estoque desconhecido: ${tipo satisfies never}`)
  }
}
