/**
 * Utilitários para ler da requisição CAP a chave da instância, o tipo de
 * instância (rascunho ou ativa) e o conteúdo de uploads.
 */

/**
 * Chave ID da instância endereçada: o último segmento do caminho (ex.:
 * Pedidos(ID=...,IsActiveEntity=true)) ou, sem caminho, req.data.ID.
 * @param {import('@sap/cds').Request} req
 * @returns {string|undefined}
 */
export function chave(req) {
  const ultimo = req.params?.at(-1)
  if (ultimo && typeof ultimo === 'object') return ultimo.ID
  return ultimo ?? req.data?.ID
}

/**
 * Indica se a requisição endereça um rascunho: IsActiveEntity=false na
 * chave ou entidade alvo .drafts (eventos NEW, PATCH e DISCARD).
 * @param {import('@sap/cds').Request} req
 * @returns {boolean}
 */
export function ehRascunho(req) {
  const ultimo = req.params?.at(-1)
  if (ultimo && typeof ultimo === 'object' && 'IsActiveEntity' in ultimo) return ultimo.IsActiveEntity === false
  return Boolean(req.target?.isDraft || req.target?.name?.endsWith('.drafts'))
}

/**
 * Lê o conteúdo de um upload para um Buffer: Buffer, texto base64 (actions
 * de importação), stream (mídia enviada por PUT) ou bytes.
 * @param {unknown} valor conteúdo recebido em req.data
 * @returns {Promise<Buffer|null|undefined>} null/undefined são devolvidos como vieram
 */
export async function lerConteudo(valor) {
  if (valor == null || Buffer.isBuffer(valor)) return valor
  if (typeof valor === 'string') return Buffer.from(valor, 'base64')
  if (typeof valor[Symbol.asyncIterator] === 'function') {
    const partes = []
    for await (const parte of valor) partes.push(Buffer.isBuffer(parte) ? parte : Buffer.from(parte))
    return Buffer.concat(partes)
  }
  return Buffer.from(valor)
}
