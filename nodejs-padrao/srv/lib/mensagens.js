/**
 * Atalhos para registrar mensagens de negócio na requisição.
 * As chaves são resolvidas em _i18n/messages*.properties com os parâmetros
 * nomeados de "args" (ex.: {sku}).
 */

/**
 * Registra um erro. O CAP rejeita a requisição ao final da fase atual
 * (before/on), devolvendo de uma vez todos os erros registrados.
 * @param {import('@sap/cds').Request} req requisição em andamento
 * @param {number} status código HTTP (400, 404, 409...)
 * @param {string} chave chave da mensagem em _i18n/messages.properties
 * @param {object} [args] parâmetros nomeados da mensagem
 * @param {string} [target] campo destacado na UI (ex.: 'cpf')
 * @returns {Error} o erro registrado
 */
export function erro(req, status, chave, args = {}, target) {
  return req.error({ status, message: chave, args, ...(target && { target }) })
}

/**
 * Registra um aviso: a requisição segue com sucesso e a UI exibe a mensagem.
 * @param {import('@sap/cds').Request} req requisição em andamento
 * @param {string} chave chave da mensagem
 * @param {object} [args] parâmetros nomeados da mensagem
 * @param {string} [target] campo destacado na UI
 * @returns {Error} a mensagem registrada
 */
export function aviso(req, chave, args = {}, target) {
  return req.warn({ message: chave, args, ...(target && { target }) })
}

/**
 * Registra uma mensagem de sucesso/informação (ex.: "Pedido 0000000042 confirmado").
 * @param {import('@sap/cds').Request} req requisição em andamento
 * @param {string} chave chave da mensagem
 * @param {object} [args] parâmetros nomeados da mensagem
 * @returns {Error} a mensagem registrada
 */
export function info(req, chave, args = {}) {
  return req.info({ message: chave, args })
}

/**
 * Rejeita a requisição imediatamente, sem executar os handlers seguintes
 * (ex.: recusar na hora um valor inválido no PATCH do rascunho).
 * @param {import('@sap/cds').Request} req requisição em andamento
 * @param {number} status código HTTP
 * @param {string} chave chave da mensagem
 * @param {object} [args] parâmetros nomeados da mensagem
 * @param {string} [target] campo destacado na UI
 * @returns {never} lança o erro
 */
export function rejeitar(req, status, chave, args = {}, target) {
  return req.reject({ status, message: chave, args, ...(target && { target }) })
}
