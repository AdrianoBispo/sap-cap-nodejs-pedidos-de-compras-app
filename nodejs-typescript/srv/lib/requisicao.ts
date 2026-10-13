/**
 * Utilitários para ler da requisição CAP a chave da instância, o tipo de
 * instância (rascunho ou ativa) e o conteúdo de uploads.
 */
import type { Request } from '@sap/cds'

/**
 * Chave ID da instância endereçada: o último segmento do caminho (ex.:
 * Pedidos(ID=...,IsActiveEntity=true)) ou, sem caminho, req.data.ID.
 */
export function chave(req: Request): string | undefined {
  const ultimo: unknown = req.params?.at(-1)
  if (ultimo && typeof ultimo === 'object') return (ultimo as { ID?: string }).ID
  return (ultimo as string | undefined) ?? (req.data as { ID?: string } | undefined)?.ID
}

/**
 * Indica se a requisição endereça um rascunho: IsActiveEntity=false na
 * chave ou entidade alvo .drafts (eventos NEW, PATCH e DISCARD).
 */
export function ehRascunho(req: Request): boolean {
  const ultimo: unknown = req.params?.at(-1)
  if (ultimo && typeof ultimo === 'object' && 'IsActiveEntity' in ultimo) return ultimo.IsActiveEntity === false
  const alvo = req.target as { isDraft?: boolean, name?: string } | undefined
  return Boolean(alvo?.isDraft || alvo?.name?.endsWith('.drafts'))
}

/**
 * Lê o conteúdo de um upload para um Buffer: Buffer, texto base64 (actions
 * de importação), stream (mídia enviada por PUT) ou bytes.
 * @param valor conteúdo recebido em req.data
 * @returns null/undefined são devolvidos como vieram
 */
export async function lerConteudo(valor: unknown): Promise<Buffer | null | undefined> {
  if (valor == null) return valor as null | undefined
  if (Buffer.isBuffer(valor)) return valor
  if (typeof valor === 'string') return Buffer.from(valor, 'base64')
  if (typeof (valor as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
    const partes: Buffer[] = []
    for await (const parte of valor as AsyncIterable<Uint8Array | string>) partes.push(Buffer.isBuffer(parte) ? parte : Buffer.from(parte))
    return Buffer.concat(partes)
  }
  return Buffer.from(valor as Uint8Array)
}
