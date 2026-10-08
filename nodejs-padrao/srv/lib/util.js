/**
 * Funções puras (sem acesso a banco) reutilizadas pelos serviços.
 * Porte de ZCL_PC_UTIL do projeto RAP.
 */

export const LIMITE_ACABANDO = 10

export const MIME_IMAGEM = Object.freeze({
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
})

/** Remove tudo que não for dígito (CPF, CEP, telefone, cartão). */
export function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '')
}

/** Calcula os 2 dígitos verificadores para uma base de 9 dígitos. */
export function calcularDvCpf(base9) {
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

/** CPF válido: 11 dígitos, não repetidos e dígitos verificadores corretos. */
export function validarCpf(cpf) {
  const digitos = somenteDigitos(cpf)
  if (digitos.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digitos)) return false
  return calcularDvCpf(digitos.slice(0, 9)) === digitos
}

export function formatarCpf(cpf) {
  const d = somenteDigitos(cpf)
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d
}

export function formatarCep(cep) {
  const d = somenteDigitos(cep)
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export function validarEmail(email) {
  return /^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$/.test(String(email ?? '').trim().toLowerCase())
}

export function validarTelefone(telefone) {
  const d = somenteDigitos(telefone)
  return d.length >= 10 && d.length <= 11
}

/** SEM_ESTOQUE (0), ACABANDO (1-10) ou EM_ESTOQUE (>= 11). */
export function calcularStatusEstoque(qtdeDisponivel) {
  if (qtdeDisponivel <= 0) return 'SEM_ESTOQUE'
  if (qtdeDisponivel <= LIMITE_ACABANDO) return 'ACABANDO'
  return 'EM_ESTOQUE'
}

/** "Logradouro, Número - Complemento - Bairro - Cidade/UF - CEP 00000-000". */
export function formatarEndereco({ logradouro, numero, complemento, bairro, cidade, uf, cep }) {
  const comp = complemento?.trim() ? ` - ${complemento.trim()}` : ''
  return `${logradouro ?? ''}, ${numero ?? ''}${comp} - ${bairro ?? ''} - ${cidade ?? ''}/${uf ?? ''} - CEP ${formatarCep(cep)}`
}

/** Prefixo de 3 letras do SKU a partir do código da categoria (completado com X). */
export function prefixoCategoria(categoria) {
  return String(categoria ?? '').trim().toUpperCase().padEnd(3, 'X').slice(0, 3)
}

/** SKU no formato SKU-<prefixo>-<10 dígitos>, ex.: SKU-ELE-0000000042. */
export function montarSku(categoria, sequencial) {
  return `SKU-${prefixoCategoria(categoria)}-${String(sequencial).padStart(10, '0')}`
}

/**
 * Aceita somente JPEG, PNG ou WEBP: MIME type, extensão e assinatura binária.
 * Conteúdo vazio é válido (foto opcional).
 */
export function validarImagem(conteudo, mimeType, nomeArquivo) {
  if (!conteudo || conteudo.length === 0) return true
  const mime = String(mimeType ?? '').trim().toLowerCase()
  const nome = String(nomeArquivo ?? '').trim().toLowerCase()
  if (!Object.values(MIME_IMAGEM).includes(mime)) return false
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

/** Arredonda valores monetários para 2 casas. */
export function arredondar(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100
}

/** Soma as quantidades por item: [{ item_ID, qtdeItemPedido }] -> Map(item_ID -> qtde). */
export function somarQuantidades(itens) {
  const totais = new Map()
  for (const { item_ID, qtdeItemPedido } of itens ?? []) {
    if (!item_ID) continue
    totais.set(item_ID, (totais.get(item_ID) ?? 0) + Number(qtdeItemPedido ?? 0))
  }
  return totais
}
