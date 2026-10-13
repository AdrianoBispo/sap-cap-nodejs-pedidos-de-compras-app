/**
 * Funções comuns às importações por planilha:
 * normalização de CPF/CEP, conversão texto -> código de CodeList, resumo dos
 * erros e tradução das mensagens de erro geradas pelos handlers.
 */
import cds from '@sap/cds'
import { normalizarNome } from './planilha.js'
import { somenteDigitos } from './util.js'
import { erro, info } from './mensagens.js'

const { SELECT } = cds.ql

/** Erros listados na resposta; os demais são apenas contados. */
const MAX_ERROS_EXIBIDOS = 15

/**
 * Completa com zeros à esquerda o CPF que perdeu os zeros iniciais (o Excel
 * os remove em colunas numéricas).
 * @param {unknown} texto CPF lido da planilha
 * @returns {string} somente dígitos
 */
export function normalizarCpf(texto) {
  const d = somenteDigitos(texto)
  return d.length > 0 && d.length < 11 ? d.padStart(11, '0') : d
}

/**
 * Completa com zeros à esquerda o CEP com 5 a 7 dígitos (zeros perdidos no Excel).
 * @param {unknown} texto CEP lido da planilha
 * @returns {string} somente dígitos
 */
export function normalizarCep(texto) {
  const d = somenteDigitos(texto)
  return d.length >= 5 && d.length < 8 ? d.padStart(8, '0') : d
}

/**
 * Converte o texto da planilha no código da CodeList, aceitando o código
 * (NAO_BINARIO) ou o texto (Não binário), sem diferenciar acentos e caixa.
 * @param {object} entidade CodeList do banco (ex.: Generos, Categorias)
 * @param {string} texto valor da planilha
 * @returns {Promise<string|null>} código ou null se não houver correspondência
 */
export async function converterCodelist(entidade, texto) {
  const alvo = normalizarNome(texto)
  if (!alvo) return null
  const opcoes = await SELECT.from(entidade).columns('code', 'name')
  return opcoes.find(o => normalizarNome(o.code) === alvo || normalizarNome(o.name) === alvo)?.code ?? null
}

/**
 * Textos da CodeList em ordem de exibição, separados por vírgula (usado na
 * mensagem de valor inválido).
 * @param {object} entidade CodeList do banco
 * @returns {Promise<string>}
 */
export async function opcoesCodelist(entidade) {
  const opcoes = await SELECT.from(entidade).columns('name', 'ordem').orderBy('ordem')
  return opcoes.map(o => o.name).join(', ')
}

/**
 * Limita a lista a MAX_ERROS_EXIBIDOS erros e acrescenta quantos foram omitidos.
 * @param {string[]} erros
 * @returns {string[]}
 */
export function resumirErros(erros) {
  if (erros.length <= MAX_ERROS_EXIBIDOS) return erros
  return [...erros.slice(0, MAX_ERROS_EXIBIDOS), `... e mais ${erros.length - MAX_ERROS_EXIBIDOS} erro(s).`]
}

/**
 * Reporta o resumo e os erros por linha. Como são erros da requisição, a
 * transação é desfeita e nada é gravado.
 * @param {import('@sap/cds').Request} req requisição da action
 * @param {string[]} erros mensagens por linha
 * @returns {undefined}
 */
export function falharImportacao(req, erros) {
  erro(req, 400, 'IMPORTACAO_CANCELADA', { quantidade: erros.length })
  for (const texto of resumirErros(erros)) erro(req, 400, 'IMPORTACAO_DETALHE', { texto })
}

/**
 * Registra a mensagem de sucesso e monta o retorno da action (ResultadoImportacao).
 * @param {import('@sap/cds').Request} req requisição da action
 * @param {number} quantidade registros criados
 * @returns {{registrosCriados:number, mensagem:string}}
 */
export function concluirImportacao(req, quantidade) {
  info(req, 'IMPORTACAO_CONCLUIDA', { quantidade })
  return {
    registrosCriados: quantidade,
    mensagem: cds.i18n.messages.at('IMPORTACAO_CONCLUIDA', req.locale, { quantidade }) ?? `${quantidade} registro(s) criado(s).`
  }
}

/**
 * Textos traduzidos de um erro lançado por uma chamada aninhada ao serviço
 * (srv.run). Um erro com vários detalhes gera um texto por detalhe.
 * @param {unknown} e erro capturado
 * @param {string|undefined} locale idioma da requisição
 * @returns {string[]}
 */
export function textosDoErro(e, locale) {
  const lista = e?.details?.length ? e.details : [e]
  return lista.map(d => cds.i18n.messages.at(d.message, locale, d.args) ?? d.message ?? String(d))
}
