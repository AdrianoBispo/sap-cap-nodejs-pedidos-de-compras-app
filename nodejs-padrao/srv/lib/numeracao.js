/**
 * Sequenciais do projeto (substitui o Number Range Object ZPC_NR e
 * ZCL_PC_NUMERACAO do RAP). A tabela pedidoscompras.Numeracoes guarda o último
 * número de cada objeto; o incremento é um UPDATE atômico na transação da
 * requisição, então um Save que falha também desfaz o número (sem buracos).
 */
import cds from '@sap/cds'
import { montarSku } from './util.js'

const { SELECT, UPDATE, INSERT } = cds.ql

export const OBJETO = Object.freeze({ pedido: 'PEDIDO', sku: 'SKU' })

/** Próximo número do objeto (PEDIDO ou SKU), dentro da transação atual. */
export async function proximoNumero(objeto) {
  const { Numeracoes } = cds.entities('pedidoscompras')
  const alterados = await UPDATE(Numeracoes)
    .set('ultimoNumero = ultimoNumero + 1')
    .where({ objeto })
  if (!alterados) {
    await INSERT.into(Numeracoes).entries({ objeto, ultimoNumero: 1 })
    return 1
  }
  const { ultimoNumero } = await SELECT.one.from(Numeracoes).columns('ultimoNumero').where({ objeto })
  return Number(ultimoNumero)
}

/** Número do pedido com 10 dígitos (ex.: 0000000042). */
export async function proximoNumeroPedido() {
  return String(await proximoNumero(OBJETO.pedido)).padStart(10, '0')
}

/** SKU-<3 letras da categoria>-<10 dígitos>. */
export async function gerarSku(categoria) {
  return montarSku(categoria, await proximoNumero(OBJETO.sku))
}
