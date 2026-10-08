/**
 * Atalhos para registrar mensagens de negócio na requisição.
 * As chaves são resolvidas em _i18n/messages*.properties com os parâmetros
 * nomeados de "args" (ex.: {sku}).
 */

/** Registra um erro (a requisição é rejeitada ao final da fase atual). */
export function erro(req, status, chave, args = {}, target) {
  return req.error({ status, message: chave, args, ...(target && { target }) })
}

/** Registra um aviso (resposta de sucesso com mensagem). */
export function aviso(req, chave, args = {}, target) {
  return req.warn({ message: chave, args, ...(target && { target }) })
}

/** Registra uma mensagem de sucesso/informação. */
export function info(req, chave, args = {}) {
  return req.info({ message: chave, args })
}

/** Rejeita a requisição imediatamente (ex.: precheck em PATCH de rascunho). */
export function rejeitar(req, status, chave, args = {}, target) {
  return req.reject({ status, message: chave, args, ...(target && { target }) })
}
