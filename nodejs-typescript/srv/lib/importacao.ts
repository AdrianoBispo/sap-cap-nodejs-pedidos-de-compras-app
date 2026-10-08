/**
 * Funções comuns às importações por planilha (porte de ZCL_PC_IMPORTACAO):
 * normalização de CPF/CEP, conversão texto -> código de CodeList, resumo dos
 * erros e tradução das mensagens de erro geradas pelos handlers.
 */
import cds, { type Request } from '@sap/cds'
import type { ResultadoImportacao } from '#cds-models/pedidoscompras'
import { normalizarNome } from './planilha.js'
import { somenteDigitos } from './util.js'
import { erro, info } from './mensagens.js'

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

/** CPF sem os zeros à esquerda (o Excel os perde em colunas numéricas) é completado. */
export function normalizarCpf(texto: unknown): string {
  const d = somenteDigitos(texto)
  return d.length > 0 && d.length < 11 ? d.padStart(11, '0') : d
}

/** CEP com 5 a 7 dígitos é completado com zeros à esquerda. */
export function normalizarCep(texto: unknown): string {
  const d = somenteDigitos(texto)
  return d.length >= 5 && d.length < 8 ? d.padStart(8, '0') : d
}

/** Aceita o código (NAO_BINARIO) ou o texto (Não binário) da CodeList. */
export async function converterCodelist(entidade: CodeListAlvo, texto: string): Promise<string | null> {
  const alvo = normalizarNome(texto)
  if (!alvo) return null
  const opcoes: OpcaoCodeList[] = await SELECT.from(entidade).columns('code', 'name')
  return opcoes.find(o => normalizarNome(o.code) === alvo || normalizarNome(o.name) === alvo)?.code ?? null
}

export async function opcoesCodelist(entidade: CodeListAlvo): Promise<string> {
  const opcoes: OpcaoCodeList[] = await SELECT.from(entidade).columns('name', 'ordem').orderBy('ordem')
  return opcoes.map(o => o.name).join(', ')
}

/** No máximo 15 erros, mais o total omitido. */
export function resumirErros(erros: string[]): string[] {
  if (erros.length <= MAX_ERROS_EXIBIDOS) return erros
  return [...erros.slice(0, MAX_ERROS_EXIBIDOS), `... e mais ${erros.length - MAX_ERROS_EXIBIDOS} erro(s).`]
}

/** Reporta o resumo e os erros por linha; nada é gravado (a transação é desfeita). */
export function falharImportacao(req: Request, erros: string[]): undefined {
  erro(req, 400, 'IMPORTACAO_CANCELADA', { quantidade: erros.length })
  for (const texto of resumirErros(erros)) erro(req, 400, 'IMPORTACAO_DETALHE', { texto })
  return undefined
}

export function concluirImportacao(req: Request, quantidade: number): ResultadoImportacao {
  info(req, 'IMPORTACAO_CONCLUIDA', { quantidade })
  return {
    registrosCriados: quantidade,
    mensagem: traduzir('IMPORTACAO_CONCLUIDA', req.locale, { quantidade }) ?? `${quantidade} registro(s) criado(s).`
  }
}

/** Texto (traduzido) de um erro lançado por uma chamada aninhada ao serviço. */
export function textosDoErro(e: unknown, locale: string | undefined): string[] {
  const erroServico = e as ErroServico | undefined
  const lista: unknown[] = erroServico?.details?.length ? erroServico.details : [e]
  return lista.map(item => {
    const d = item as ErroServico | undefined
    return traduzir(d?.message, locale, d?.args) ?? d?.message ?? String(item)
  })
}
