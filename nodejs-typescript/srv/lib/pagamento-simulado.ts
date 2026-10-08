/**
 * Pagamento simulado com cartão (porte de ZCL_PC_PAGAMENTO_SIM).
 *
 * Nenhum dado sensível sai desta função: número completo, validade e CVV são
 * usados apenas em memória. Regras da simulação:
 *  - número iniciado com 4 => VISA; iniciado com 5 => MASTERCARD
 *  - CVV 000 => pagamento RECUSADO
 *  - demais combinações válidas => APROVADO
 */
import { randomInt } from 'node:crypto'
import type { MetodosPagamento_code } from '#cds-models/pedidoscompras'
import { somenteDigitos } from './util.js'

export const METODOS: readonly MetodosPagamento_code[] = Object.freeze(['CARTAO_CREDITO', 'CARTAO_DEBITO'])

export interface EntradaPagamento {
  metodo?: string | null
  numero?: string | null
  validade?: string | null
  cvv?: string | null
}

export type Bandeira = 'VISA' | 'MASTERCARD' | 'OUTRA'

/** Dados de entrada inválidos: erro de validação, não recusa da operadora. */
export interface PagamentoInvalido {
  dadosValidos: false
  erro: string
}

/** Resultado seguro (sem número completo, validade ou CVV). */
export interface PagamentoProcessado {
  dadosValidos: true
  metodo: MetodosPagamento_code
  bandeira: Bandeira
  ultimos4: string
  cartaoMascarado: string
  status: 'APROVADO' | 'RECUSADO'
  codigoAutorizacao: string | null
  mensagem: string
}

export type ResultadoPagamento = PagamentoInvalido | PagamentoProcessado

/**
 * @param entrada dados digitados na UI
 * @param hoje data de referência (testes)
 */
export function simularPagamento(entrada: EntradaPagamento, hoje: Date = new Date()): ResultadoPagamento {
  const metodo = String(entrada.metodo ?? '').trim().toUpperCase()
  const numero = somenteDigitos(entrada.numero)
  const validade = somenteDigitos(entrada.validade)
  const cvv = somenteDigitos(entrada.cvv)

  const erro = validarFormato({ metodo, numero, validade, cvv }, hoje)
  if (erro) return { dadosValidos: false, erro }

  const bandeira: Bandeira = numero[0] === '4' ? 'VISA' : numero[0] === '5' ? 'MASTERCARD' : 'OUTRA'
  const ultimos4 = numero.slice(-4)
  const resultado = {
    dadosValidos: true as const,
    metodo: metodo as MetodosPagamento_code,
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

function validarFormato({ metodo, numero, validade, cvv }: Record<'metodo' | 'numero' | 'validade' | 'cvv', string>, hoje: Date): string | null {
  if (!(METODOS as readonly string[]).includes(metodo)) return 'método de pagamento inválido'
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
