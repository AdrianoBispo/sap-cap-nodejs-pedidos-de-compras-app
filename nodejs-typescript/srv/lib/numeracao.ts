/**
 * Numeração sequencial do projeto: número do pedido e sequencial do SKU.
 * A tabela pedidoscompras.Numeracoes guarda o último número de cada objeto;
 * o incremento é um UPDATE atômico na transação da requisição, então um
 * Save que falha também desfaz o número (sem buracos).
 */
import { Numeracoes } from '#cds-models/pedidoscompras'
import { montarSku } from './util.js'

/** Objetos com numeração própria (chave da tabela Numeracoes). */
export const OBJETO = Object.freeze({ pedido: 'PEDIDO', sku: 'SKU' } as const)
export type Objeto = typeof OBJETO[keyof typeof OBJETO]

/**
 * Reserva o próximo número do objeto na transação atual. O UPDATE
 * incrementa e bloqueia a linha até o commit, o que serializa Saves
 * concorrentes; na primeira vez a linha do objeto é criada com 1.
 */
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

/** Próximo número de pedido com 10 dígitos (ex.: 0000000042). */
export async function proximoNumeroPedido(): Promise<string> {
  return String(await proximoNumero(OBJETO.pedido)).padStart(10, '0')
}

/**
 * Gera um SKU novo para a categoria: SKU-<3 letras>-<10 dígitos>.
 * @param categoria código da categoria (ex.: ELETRONICOS)
 */
export async function gerarSku(categoria: string): Promise<string> {
  return montarSku(categoria, await proximoNumero(OBJETO.sku))
}
