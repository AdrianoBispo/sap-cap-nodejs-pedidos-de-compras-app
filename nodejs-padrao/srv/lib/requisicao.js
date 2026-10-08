/**
 * Utilitários para ler chaves e o tipo de instância (rascunho ou ativa) de
 * uma requisição CAP.
 */

/** Chave ID da instância endereçada (último segmento do caminho). */
export function chave(req) {
  const ultimo = req.params?.at(-1)
  if (ultimo && typeof ultimo === 'object') return ultimo.ID
  return ultimo ?? req.data?.ID
}

/** true quando a requisição endereça um rascunho (IsActiveEntity=false). */
export function ehRascunho(req) {
  const ultimo = req.params?.at(-1)
  if (ultimo && typeof ultimo === 'object' && 'IsActiveEntity' in ultimo) return ultimo.IsActiveEntity === false
  return Boolean(req.target?.isDraft || req.target?.name?.endsWith('.drafts'))
}

/** Lê o conteúdo de um stream (upload de mídia) para um Buffer. */
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
