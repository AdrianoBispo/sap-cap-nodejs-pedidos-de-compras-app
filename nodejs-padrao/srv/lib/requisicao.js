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
 * Leitura em andamento ou concluída de cada stream de upload. Um stream só pode
 * ser lido uma vez, e os handlers before de um mesmo evento rodam em paralelo:
 * sem isso, dois handlers lendo a mesma mídia dividiriam os bytes entre si e o
 * último a terminar gravaria uma foto vazia.
 * @type {WeakMap<object, Promise<Buffer>>}
 */
const leituras = new WeakMap()

/**
 * Lê o conteúdo de um upload para um Buffer: Buffer, texto base64 (actions
 * de importação), stream (mídia enviada por PUT) ou bytes. O mesmo stream
 * lido de novo devolve o mesmo Buffer.
 * @param {unknown} valor conteúdo recebido em req.data
 * @returns {Promise<Buffer|null|undefined>} null/undefined são devolvidos como vieram
 */
export async function lerConteudo(valor) {
  if (valor == null || Buffer.isBuffer(valor)) return valor
  if (typeof valor === 'string') return Buffer.from(valor, 'base64')
  if (typeof valor[Symbol.asyncIterator] === 'function') {
    let leitura = leituras.get(valor)
    if (!leitura) leituras.set(valor, (leitura = lerStream(valor)))
    return leitura
  }
  return Buffer.from(valor)
}

/**
 * Junta os pedaços de um stream num Buffer.
 * @param {AsyncIterable<Uint8Array|string>} stream
 * @returns {Promise<Buffer>}
 */
async function lerStream(stream) {
  const partes = []
  for await (const parte of stream) partes.push(Buffer.isBuffer(parte) ? parte : Buffer.from(parte))
  return Buffer.concat(partes)
}
