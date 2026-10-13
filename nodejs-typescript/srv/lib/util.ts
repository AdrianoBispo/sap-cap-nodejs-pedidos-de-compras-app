/**
 * Funções puras (sem acesso a banco) reutilizadas pelos serviços: dígitos e
 * formatação de CPF/CEP, validações simples, SKU, imagens e valores.
 */
import type { StatusEstoque_code } from '#cds-models/pedidoscompras'

/** Saldo disponível até este valor (inclusive) é status ACABANDO. */
export const LIMITE_ACABANDO = 10

/** Tipos MIME aceitos nas fotos de cliente e de item. */
export const MIME_IMAGEM = Object.freeze({
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
} as const)

/** Partes do endereço usadas no texto completo. */
export interface PartesEndereco {
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  cep?: string | null
}

/** Linha com item e quantidade (itens do pedido, planilha etc.). */
export interface LinhaQuantidade {
  item_ID?: string | null
  qtdeItemPedido?: number | string | null
}

/**
 * Remove tudo que não for dígito (CPF, CEP, telefone, cartão).
 * @param valor texto de entrada (null/undefined viram '')
 * @returns somente os dígitos
 */
export function somenteDigitos(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '')
}

/**
 * Completa uma base de 9 dígitos com os 2 dígitos verificadores do CPF
 * (módulo 11 com pesos decrescentes).
 * @param base9 nove primeiros dígitos do CPF
 * @returns CPF com 11 dígitos, ou '' se a base não tiver 9 dígitos
 */
export function calcularDvCpf(base9: string | number): string {
  let cpf = somenteDigitos(base9)
  if (cpf.length !== 9) return ''
  for (let rodada = 0; rodada < 2; rodada++) {
    const tamanho = cpf.length
    let soma = 0
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i)
    let resto = (soma * 10) % 11
    if (resto === 10) resto = 0
    cpf += resto
  }
  return cpf
}

/**
 * CPF válido: 11 dígitos, não todos iguais e dígitos verificadores corretos.
 * @param cpf CPF com ou sem máscara
 */
export function validarCpf(cpf: unknown): boolean {
  const digitos = somenteDigitos(cpf)
  if (digitos.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digitos)) return false
  return calcularDvCpf(digitos.slice(0, 9)) === digitos
}

/**
 * Formata o CPF como 000.000.000-00.
 * @param cpf CPF com ou sem máscara
 * @returns CPF formatado, ou só os dígitos se não houver 11
 */
export function formatarCpf(cpf: unknown): string {
  const d = somenteDigitos(cpf)
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d
}

/**
 * Formata o CEP como 00000-000.
 * @param cep CEP com ou sem máscara
 * @returns CEP formatado, ou só os dígitos se não houver 8
 */
export function formatarCep(cep: unknown): string {
  const d = somenteDigitos(cep)
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/**
 * E-mail no formato usuario@dominio.tld, comparado em minúsculas (mesma
 * expressão do @assert.format de Clientes.email em srv/validacoes.cds).
 */
export function validarEmail(email: unknown): boolean {
  return /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(String(email ?? '').trim().toLowerCase())
}

/**
 * Telefone com DDD: 10 (fixo) ou 11 (celular) dígitos.
 * @param telefone com ou sem máscara
 */
export function validarTelefone(telefone: unknown): boolean {
  const d = somenteDigitos(telefone)
  return d.length >= 10 && d.length <= 11
}

/**
 * Status do estoque pelo saldo disponível: SEM_ESTOQUE (<= 0), ACABANDO
 * (1 a 10) ou EM_ESTOQUE (>= 11). Mesma regra da coluna calculada
 * Itens.statusEstoque_code (db/schema.cds).
 * @param qtdeDisponivel qtdeEstoque - qtdeReservada
 */
export function calcularStatusEstoque(qtdeDisponivel: number): StatusEstoque_code {
  if (qtdeDisponivel <= 0) return 'SEM_ESTOQUE'
  if (qtdeDisponivel <= LIMITE_ACABANDO) return 'ACABANDO'
  return 'EM_ESTOQUE'
}

/**
 * Texto do endereço: "Logradouro, Número - Complemento - Bairro - Cidade/UF - CEP 00000-000".
 * O complemento só aparece quando informado.
 */
export function formatarEndereco({ logradouro, numero, complemento, bairro, cidade, uf, cep }: PartesEndereco): string {
  const comp = complemento?.trim() ? ` - ${complemento.trim()}` : ''
  return `${logradouro ?? ''}, ${numero ?? ''}${comp} - ${bairro ?? ''} - ${cidade ?? ''}/${uf ?? ''} - CEP ${formatarCep(cep)}`
}

/**
 * Prefixo de 3 letras do SKU a partir do código da categoria (completado com X).
 * @param categoria código da categoria (ex.: ELETRONICOS -> ELE)
 */
export function prefixoCategoria(categoria: unknown): string {
  return String(categoria ?? '').trim().toUpperCase().padEnd(3, 'X').slice(0, 3)
}

/**
 * Monta o SKU no formato SKU-<prefixo>-<10 dígitos>, ex.: SKU-ELE-0000000042.
 * @param categoria código da categoria
 * @param sequencial número sequencial do SKU
 */
export function montarSku(categoria: string, sequencial: number): string {
  return `SKU-${prefixoCategoria(categoria)}-${String(sequencial).padStart(10, '0')}`
}

/**
 * Aceita somente JPEG, PNG ou WEBP, conferindo o MIME type, a extensão do
 * arquivo (quando informada) e a assinatura binária do conteúdo.
 * Conteúdo vazio é válido (a foto é opcional).
 * @param conteudo bytes da imagem
 * @param mimeType tipo informado no upload
 * @param nomeArquivo nome do arquivo enviado
 */
export function validarImagem(conteudo: Uint8Array | null | undefined, mimeType: unknown, nomeArquivo: unknown): boolean {
  if (!conteudo || conteudo.length === 0) return true
  const mime = String(mimeType ?? '').trim().toLowerCase()
  const nome = String(nomeArquivo ?? '').trim().toLowerCase()
  if (!(Object.values(MIME_IMAGEM) as string[]).includes(mime)) return false
  if (nome && !/\.(jpe?g|png|webp)$/.test(nome)) return false
  const bytes = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo)
  switch (mime) {
    case MIME_IMAGEM.png:
      return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    case MIME_IMAGEM.webp:
      return bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP'
    default:
      return bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
  }
}

/**
 * Arredonda valores monetários para 2 casas (Number.EPSILON corrige casos
 * como 1.005, que em ponto flutuante fica um pouco abaixo de 1.005).
 */
export function arredondar(valor: unknown): number {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100
}

/**
 * Soma as quantidades por item; linhas sem item são ignoradas.
 * @param itens linhas do pedido
 * @returns item_ID -> quantidade total
 */
export function somarQuantidades(itens: readonly LinhaQuantidade[] | null | undefined): Map<string, number> {
  const totais = new Map<string, number>()
  for (const { item_ID, qtdeItemPedido } of itens ?? []) {
    if (!item_ID) continue
    totais.set(item_ID, (totais.get(item_ID) ?? 0) + Number(qtdeItemPedido ?? 0))
  }
  return totais
}
