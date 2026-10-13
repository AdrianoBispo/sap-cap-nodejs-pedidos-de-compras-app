/**
 * Pagamento simulado com cartão.
 *
 * Nenhum dado sensível sai desta função: número completo, validade e CVV são
 * usados apenas em memória. Regras da simulação:
 *  - número iniciado com 4 => VISA; iniciado com 5 => MASTERCARD
 *  - CVV 000 => pagamento RECUSADO
 *  - demais combinações válidas => APROVADO
 */
import { randomInt } from 'node:crypto'
import { somenteDigitos } from './util.js'

/** Métodos de pagamento aceitos (códigos da CodeList MetodosPagamento). */
export const METODOS = Object.freeze(['CARTAO_CREDITO', 'CARTAO_DEBITO'])

/**
 * Valida os dados do cartão e simula a resposta da operadora.
 * @param {{metodo:string, numero:string, validade:string, cvv:string}} entrada dados digitados (validade MM/AA)
 * @param {Date} [hoje] data de referência para o cartão expirado (testes)
 * @returns {object} dadosValidos false com o erro de formato, ou o resultado
 *   seguro (status, bandeira, últimos 4 dígitos, cartão mascarado, autorização)
 */
export function simularPagamento(entrada, hoje = new Date()) {
  const metodo = String(entrada.metodo ?? '').trim().toUpperCase()
  const numero = somenteDigitos(entrada.numero)
  const validade = somenteDigitos(entrada.validade)
  const cvv = somenteDigitos(entrada.cvv)

  const erro = validarFormato({ metodo, numero, validade, cvv }, hoje)
  if (erro) return { dadosValidos: false, erro }

  const bandeira = numero[0] === '4' ? 'VISA' : numero[0] === '5' ? 'MASTERCARD' : 'OUTRA'
  const ultimos4 = numero.slice(-4)
  const resultado = {
    dadosValidos: true,
    metodo,
    bandeira,
    ultimos4,
    cartaoMascarado: `**** **** **** ${ultimos4}`
  }
  if (cvv === '000') {
    return { ...resultado, status: 'RECUSADO', codigoAutorizacao: null, mensagem: 'Pagamento recusado pela operadora (simulação).' }
  }
  return {
    ...resultado,
    status: 'APROVADO',
    codigoAutorizacao: `SIM${randomInt(100000, 1000000)}`,
    mensagem: `Pagamento aprovado (simulação) - ${bandeira}.`
  }
}

/**
 * Primeiro problema de formato encontrado, em texto para a mensagem
 * CARTAO_DADOS_INVALIDOS, ou null se os dados estão corretos.
 */
function validarFormato({ metodo, numero, validade, cvv }, hoje) {
  if (!METODOS.includes(metodo)) return 'método de pagamento inválido'
  if (numero.length < 13 || numero.length > 19) return 'número do cartão deve ter de 13 a 19 dígitos'
  if (validade.length !== 4) return 'validade deve estar no formato MM/AA'
  if (cvv.length < 3 || cvv.length > 4) return 'CVV deve ter 3 ou 4 dígitos'
  const mes = Number(validade.slice(0, 2))
  const ano = 2000 + Number(validade.slice(2))
  if (mes < 1 || mes > 12) return 'mês de validade inválido'
  const anoAtual = hoje.getFullYear()
  const mesAtual = hoje.getMonth() + 1
  if (ano < anoAtual || (ano === anoAtual && mes < mesAtual)) return 'cartão expirado'
  return null
}
