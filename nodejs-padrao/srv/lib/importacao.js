/**
 * Funções comuns às importações por planilha (porte de ZCL_PC_IMPORTACAO):
 * normalização de CPF/CEP, conversão texto -> código de CodeList, resumo dos
 * erros e tradução das mensagens de erro geradas pelos handlers.
 */
import cds from '@sap/cds'
import { normalizarNome } from './planilha.js'
import { somenteDigitos } from './util.js'
import { erro, info } from './mensagens.js'

const { SELECT } = cds.ql
const MAX_ERROS_EXIBIDOS = 15

/** CPF sem os zeros à esquerda (o Excel os perde em colunas numéricas) é completado. */
export function normalizarCpf(texto) {
  const d = somenteDigitos(texto)
  return d.length > 0 && d.length < 11 ? d.padStart(11, '0') : d
}

/** CEP com 5 a 7 dígitos é completado com zeros à esquerda. */
export function normalizarCep(texto) {
  const d = somenteDigitos(texto)
  return d.length >= 5 && d.length < 8 ? d.padStart(8, '0') : d
}

/** Aceita o código (NAO_BINARIO) ou o texto (Não binário) da CodeList. */
export async function converterCodelist(entidade, texto) {
  const alvo = normalizarNome(texto)
  if (!alvo) return null
  const opcoes = await SELECT.from(entidade).columns('code', 'name')
  return opcoes.find(o => normalizarNome(o.code) === alvo || normalizarNome(o.name) === alvo)?.code ?? null
}

export async function opcoesCodelist(entidade) {
  const opcoes = await SELECT.from(entidade).columns('name', 'ordem').orderBy('ordem')
  return opcoes.map(o => o.name).join(', ')
}

/** No máximo 15 erros, mais o total omitido. */
export function resumirErros(erros) {
  if (erros.length <= MAX_ERROS_EXIBIDOS) return erros
  return [...erros.slice(0, MAX_ERROS_EXIBIDOS), `... e mais ${erros.length - MAX_ERROS_EXIBIDOS} erro(s).`]
}

/** Reporta o resumo e os erros por linha; nada é gravado (a transação é desfeita). */
export function falharImportacao(req, erros) {
  erro(req, 400, 'IMPORTACAO_CANCELADA', { quantidade: erros.length })
  for (const texto of resumirErros(erros)) erro(req, 400, 'IMPORTACAO_DETALHE', { texto })
}

export function concluirImportacao(req, quantidade) {
  info(req, 'IMPORTACAO_CONCLUIDA', { quantidade })
  return {
    registrosCriados: quantidade,
    mensagem: cds.i18n.messages.at('IMPORTACAO_CONCLUIDA', req.locale, { quantidade }) ?? `${quantidade} registro(s) criado(s).`
  }
}

/** Texto (traduzido) de um erro lançado por uma chamada aninhada ao serviço. */
export function textosDoErro(e, locale) {
  const lista = e?.details?.length ? e.details : [e]
  return lista.map(d => cds.i18n.messages.at(d.message, locale, d.args) ?? d.message ?? String(d))
}
