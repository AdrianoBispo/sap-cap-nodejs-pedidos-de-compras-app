/**
 * Numeração sequencial do projeto: número do pedido e sequencial do SKU.
 * A tabela pedidoscompras.Numeracoes guarda o último número de cada objeto;
 * o incremento é um UPDATE atômico na transação da requisição, então um
 * Save que falha também desfaz o número (sem buracos).
 */
import cds from '@sap/cds'
import { montarSku } from './util.js'

const { SELECT, UPDATE, INSERT } = cds.ql

/** Objetos com numeração própria (chave da tabela Numeracoes). */
export const OBJETO = Object.freeze({ pedido: 'PEDIDO', sku: 'SKU' })

/**
 * Reserva o próximo número do objeto na transação atual. O UPDATE
 * incrementa e bloqueia a linha até o commit, o que serializa Saves
 * concorrentes; na primeira vez a linha do objeto é criada com 1.
 * @param {'PEDIDO'|'SKU'} objeto
 * @returns {Promise<number>}
 */
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

/**
 * Próximo número de pedido com 10 dígitos (ex.: 0000000042).
 * @returns {Promise<string>}
 */
export async function proximoNumeroPedido() {
  return String(await proximoNumero(OBJETO.pedido)).padStart(10, '0')
}

/**
 * Gera um SKU novo para a categoria: SKU-<3 letras>-<10 dígitos>.
 * @param {string} categoria código da categoria (ex.: ELETRONICOS)
 * @returns {Promise<string>}
 */
export async function gerarSku(categoria) {
  return montarSku(categoria, await proximoNumero(OBJETO.sku))
}
