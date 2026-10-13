/**
 * Atalhos para registrar mensagens de negócio na requisição.
 * As chaves são resolvidas em _i18n/messages*.properties com os parâmetros
 * nomeados de "args" (ex.: {sku}).
 */
import type { Request } from '@sap/cds'

/** Parâmetros nomeados da mensagem (ex.: { sku: 'SKU-ELE-0000000001' }). */
export type ArgsMensagem = Record<string, unknown>

/** Formato de objeto aceito por req.error/warn/info/reject. */
type MensagemCds = Parameters<Request['reject']>[0] & object

/**
 * O runtime aceita "args" nomeados (objeto), mas a tipagem do @cap-js/cds-types
 * só prevê argumentos posicionais (array); a conversão fica concentrada aqui.
 */
function mensagem(chave: string, args: ArgsMensagem, status?: number, target?: string): MensagemCds {
  return { ...(status && { status }), message: chave, args, ...(target && { target }) } as unknown as MensagemCds
}

/**
 * Registra um erro. O CAP rejeita a requisição ao final da fase atual
 * (before/on), devolvendo de uma vez todos os erros registrados.
 * @param req requisição em andamento
 * @param status código HTTP (400, 404, 409...)
 * @param chave chave da mensagem em _i18n/messages.properties
 * @param args parâmetros nomeados da mensagem
 * @param target campo destacado na UI (ex.: 'cpf')
 * @returns o erro registrado
 */
export function erro(req: Request, status: number, chave: string, args: ArgsMensagem = {}, target?: string): Error {
  return req.error(mensagem(chave, args, status, target))
}

/**
 * Registra um aviso: a requisição segue com sucesso e a UI exibe a mensagem.
 * @param req requisição em andamento
 * @param chave chave da mensagem
 * @param args parâmetros nomeados da mensagem
 * @param target campo destacado na UI
 * @returns a mensagem registrada
 */
export function aviso(req: Request, chave: string, args: ArgsMensagem = {}, target?: string): Error {
  return req.warn(mensagem(chave, args, undefined, target))
}

/**
 * Registra uma mensagem de sucesso/informação (ex.: "Pedido 0000000042 confirmado").
 * @param req requisição em andamento
 * @param chave chave da mensagem
 * @param args parâmetros nomeados da mensagem
 * @returns a mensagem registrada
 */
export function info(req: Request, chave: string, args: ArgsMensagem = {}): Error {
  return req.info(mensagem(chave, args))
}

/**
 * Rejeita a requisição imediatamente, sem executar os handlers seguintes
 * (ex.: recusar na hora um valor inválido no PATCH do rascunho).
 * @param req requisição em andamento
 * @param status código HTTP
 * @param chave chave da mensagem
 * @param args parâmetros nomeados da mensagem
 * @param target campo destacado na UI
 * @returns lança o erro
 */
export function rejeitar(req: Request, status: number, chave: string, args: ArgsMensagem = {}, target?: string): never {
  return req.reject(mensagem(chave, args, status, target))
}
