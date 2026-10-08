/**
 * Sequenciais do projeto (substitui o Number Range Object ZPC_NR e
 * ZCL_PC_NUMERACAO do RAP). A tabela pedidoscompras.Numeracoes guarda o último
 * número de cada objeto; o incremento é um UPDATE atômico na transação da
 * requisição, então um Save que falha também desfaz o número (sem buracos).
 */
import { Numeracoes } from '#cds-models/pedidoscompras'
import { montarSku } from './util.js'

export const OBJETO = Object.freeze({ pedido: 'PEDIDO', sku: 'SKU' } as const)
export type Objeto = typeof OBJETO[keyof typeof OBJETO]

/** Próximo número do objeto (PEDIDO ou SKU), dentro da transação atual. */
export async function proximoNumero(objeto: Objeto): Promise<number> {
  const alterados: number = await UPDATE(Numeracoes)
    .with({ ultimoNumero: { '+=': 1 } })
    .where({ objeto })
  if (!alterados) {
    await INSERT.into(Numeracoes).entries({ objeto, ultimoNumero: 1 })
    return 1
  }
  const linha = await SELECT.one.from(Numeracoes).columns('ultimoNumero').where({ objeto })
  return Number(linha?.ultimoNumero)
}

/** Número do pedido com 10 dígitos (ex.: 0000000042). */
export async function proximoNumeroPedido(): Promise<string> {
  return String(await proximoNumero(OBJETO.pedido)).padStart(10, '0')
}

/** SKU-<3 letras da categoria>-<10 dígitos>. */
export async function gerarSku(categoria: string): Promise<string> {
  return montarSku(categoria, await proximoNumero(OBJETO.sku))
}
