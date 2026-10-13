/**
 * Funções comuns às importações por planilha:
 * normalização de CPF/CEP, conversão texto -> código de CodeList, resumo dos
 * erros e tradução das mensagens de erro geradas pelos handlers.
 */
import cds, { type Request } from '@sap/cds'
import type { ResultadoImportacao } from '#cds-models/pedidoscompras'
import { normalizarNome } from './planilha.js'
import { somenteDigitos } from './util.js'
import { erro, info } from './mensagens.js'

/** Erros listados na resposta; os demais são apenas contados. */
const MAX_ERROS_EXIBIDOS = 15

/** Entidade de CodeList (Generos, Categorias...) usada na conversão. */
type CodeListAlvo = Parameters<typeof SELECT.from>[0]

/** Linha de CodeList lida para a conversão. */
interface OpcaoCodeList {
  code: string
  name?: string | null
  ordem?: number | null
}

/** Erro lançado por uma chamada aninhada ao serviço (com ou sem detalhes). */
interface ErroServico {
  message?: string
  args?: Record<string, unknown>
  details?: ErroServico[]
}

/** Textos traduzidos de _i18n/messages*.properties. */
function traduzir(chave: string | undefined, locale: string | undefined, args?: Record<string, unknown>): string | undefined {
  return chave ? cds.i18n.messages.at(chave, locale, args) : undefined
}

/**
 * Completa com zeros à esquerda o CPF que perdeu os zeros iniciais (o Excel
 * os remove em colunas numéricas).
 * @param texto CPF lido da planilha
 * @returns somente dígitos
 */
export function normalizarCpf(texto: unknown): string {
  const d = somenteDigitos(texto)
  return d.length > 0 && d.length < 11 ? d.padStart(11, '0') : d
}

/**
 * Completa com zeros à esquerda o CEP com 5 a 7 dígitos (zeros perdidos no Excel).
 * @param texto CEP lido da planilha
 * @returns somente dígitos
 */
export function normalizarCep(texto: unknown): string {
  const d = somenteDigitos(texto)
  return d.length >= 5 && d.length < 8 ? d.padStart(8, '0') : d
}

/**
 * Converte o texto da planilha no código da CodeList, aceitando o código
 * (NAO_BINARIO) ou o texto (Não binário), sem diferenciar acentos e caixa.
 * @param entidade CodeList do banco (ex.: Generos, Categorias)
 * @param texto valor da planilha
 * @returns código ou null se não houver correspondência
 */
export async function converterCodelist(entidade: CodeListAlvo, texto: string): Promise<string | null> {
  const alvo = normalizarNome(texto)
  if (!alvo) return null
  const opcoes: OpcaoCodeList[] = await SELECT.from(entidade).columns('code', 'name')
  return opcoes.find(o => normalizarNome(o.code) === alvo || normalizarNome(o.name) === alvo)?.code ?? null
}

/**
 * Textos da CodeList em ordem de exibição, separados por vírgula (usado na
 * mensagem de valor inválido).
 * @param entidade CodeList do banco
 */
export async function opcoesCodelist(entidade: CodeListAlvo): Promise<string> {
  const opcoes: OpcaoCodeList[] = await SELECT.from(entidade).columns('name', 'ordem').orderBy('ordem')
  return opcoes.map(o => o.name).join(', ')
}

/** Limita a lista a MAX_ERROS_EXIBIDOS erros e acrescenta quantos foram omitidos. */
export function resumirErros(erros: string[]): string[] {
  if (erros.length <= MAX_ERROS_EXIBIDOS) return erros
  return [...erros.slice(0, MAX_ERROS_EXIBIDOS), `... e mais ${erros.length - MAX_ERROS_EXIBIDOS} erro(s).`]
}

/**
 * Reporta o resumo e os erros por linha. Como são erros da requisição, a
 * transação é desfeita e nada é gravado.
 * @param req requisição da action
 * @param erros mensagens por linha
 */
export function falharImportacao(req: Request, erros: string[]): undefined {
  erro(req, 400, 'IMPORTACAO_CANCELADA', { quantidade: erros.length })
  for (const texto of resumirErros(erros)) erro(req, 400, 'IMPORTACAO_DETALHE', { texto })
  return undefined
}

/**
 * Registra a mensagem de sucesso e monta o retorno da action (ResultadoImportacao).
 * @param req requisição da action
 * @param quantidade registros criados
 */
export function concluirImportacao(req: Request, quantidade: number): ResultadoImportacao {
  info(req, 'IMPORTACAO_CONCLUIDA', { quantidade })
  return {
    registrosCriados: quantidade,
    mensagem: traduzir('IMPORTACAO_CONCLUIDA', req.locale, { quantidade }) ?? `${quantidade} registro(s) criado(s).`
  }
}

/**
 * Textos traduzidos de um erro lançado por uma chamada aninhada ao serviço
 * (srv.run). Um erro com vários detalhes gera um texto por detalhe.
 * @param e erro capturado
 * @param locale idioma da requisição
 */
export function textosDoErro(e: unknown, locale: string | undefined): string[] {
  const erroServico = e as ErroServico | undefined
  const lista: unknown[] = erroServico?.details?.length ? erroServico.details : [e]
  return lista.map(item => {
    const d = item as ErroServico | undefined
    return traduzir(d?.message, locale, d?.args) ?? d?.message ?? String(item)
  })
}
