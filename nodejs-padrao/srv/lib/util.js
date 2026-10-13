/**
 * Funções puras (sem acesso a banco) reutilizadas pelos serviços: dígitos e
 * formatação de CPF/CEP, validações simples, SKU, imagens e valores.
 */

/** Saldo disponível até este valor (inclusive) é status ACABANDO. */
export const LIMITE_ACABANDO = 10

/** Tipos MIME aceitos nas fotos de cliente e de item. */
export const MIME_IMAGEM = Object.freeze({
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
})

/**
 * Remove tudo que não for dígito (CPF, CEP, telefone, cartão).
 * @param {unknown} valor texto de entrada (null/undefined viram '')
 * @returns {string} somente os dígitos
 */
export function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '')
}

/**
 * Completa uma base de 9 dígitos com os 2 dígitos verificadores do CPF
 * (módulo 11 com pesos decrescentes).
 * @param {string|number} base9 nove primeiros dígitos do CPF
 * @returns {string} CPF com 11 dígitos, ou '' se a base não tiver 9 dígitos
 */
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

/**
 * CPF válido: 11 dígitos, não todos iguais e dígitos verificadores corretos.
 * @param {unknown} cpf CPF com ou sem máscara
 * @returns {boolean}
 */
export function validarCpf(cpf) {
  const digitos = somenteDigitos(cpf)
  if (digitos.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digitos)) return false
  return calcularDvCpf(digitos.slice(0, 9)) === digitos
}

/**
 * Formata o CPF como 000.000.000-00.
 * @param {unknown} cpf CPF com ou sem máscara
 * @returns {string} CPF formatado, ou só os dígitos se não houver 11
 */
export function formatarCpf(cpf) {
  const d = somenteDigitos(cpf)
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d
}

/**
 * Formata o CEP como 00000-000.
 * @param {unknown} cep CEP com ou sem máscara
 * @returns {string} CEP formatado, ou só os dígitos se não houver 8
 */
export function formatarCep(cep) {
  const d = somenteDigitos(cep)
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/**
 * E-mail no formato usuario@dominio.tld, comparado em minúsculas (mesma
 * expressão do @assert.format de Clientes.email em srv/validacoes.cds).
 * @param {unknown} email
 * @returns {boolean}
 */
export function validarEmail(email) {
  return /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(String(email ?? '').trim().toLowerCase())
}

/**
 * Telefone com DDD: 10 (fixo) ou 11 (celular) dígitos.
 * @param {unknown} telefone com ou sem máscara
 * @returns {boolean}
 */
export function validarTelefone(telefone) {
  const d = somenteDigitos(telefone)
  return d.length >= 10 && d.length <= 11
}

/**
 * Status do estoque pelo saldo disponível: SEM_ESTOQUE (<= 0), ACABANDO
 * (1 a 10) ou EM_ESTOQUE (>= 11). Mesma regra da coluna calculada
 * Itens.statusEstoque_code (db/schema.cds).
 * @param {number} qtdeDisponivel qtdeEstoque - qtdeReservada
 * @returns {'SEM_ESTOQUE'|'ACABANDO'|'EM_ESTOQUE'}
 */
export function calcularStatusEstoque(qtdeDisponivel) {
  if (qtdeDisponivel <= 0) return 'SEM_ESTOQUE'
  if (qtdeDisponivel <= LIMITE_ACABANDO) return 'ACABANDO'
  return 'EM_ESTOQUE'
}

/**
 * Texto do endereço: "Logradouro, Número - Complemento - Bairro - Cidade/UF - CEP 00000-000".
 * O complemento só aparece quando informado.
 * @param {{logradouro?:string, numero?:string, complemento?:string, bairro?:string, cidade?:string, uf?:string, cep?:string}} endereco
 * @returns {string}
 */
export function formatarEndereco({ logradouro, numero, complemento, bairro, cidade, uf, cep }) {
  const comp = complemento?.trim() ? ` - ${complemento.trim()}` : ''
  return `${logradouro ?? ''}, ${numero ?? ''}${comp} - ${bairro ?? ''} - ${cidade ?? ''}/${uf ?? ''} - CEP ${formatarCep(cep)}`
}

/**
 * Prefixo de 3 letras do SKU a partir do código da categoria (completado com X).
 * @param {unknown} categoria código da categoria (ex.: ELETRONICOS -> ELE)
 * @returns {string}
 */
export function prefixoCategoria(categoria) {
  return String(categoria ?? '').trim().toUpperCase().padEnd(3, 'X').slice(0, 3)
}

/**
 * Monta o SKU no formato SKU-<prefixo>-<10 dígitos>, ex.: SKU-ELE-0000000042.
 * @param {string} categoria código da categoria
 * @param {number} sequencial número sequencial do SKU
 * @returns {string}
 */
export function montarSku(categoria, sequencial) {
  return `SKU-${prefixoCategoria(categoria)}-${String(sequencial).padStart(10, '0')}`
}

/**
 * Aceita somente JPEG, PNG ou WEBP, conferindo o MIME type, a extensão do
 * arquivo (quando informada) e a assinatura binária do conteúdo.
 * Conteúdo vazio é válido (a foto é opcional).
 * @param {Uint8Array|null|undefined} conteudo bytes da imagem
 * @param {unknown} mimeType tipo informado no upload
 * @param {unknown} nomeArquivo nome do arquivo enviado
 * @returns {boolean}
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

/**
 * Arredonda valores monetários para 2 casas (Number.EPSILON corrige casos
 * como 1.005, que em ponto flutuante fica um pouco abaixo de 1.005).
 * @param {unknown} valor
 * @returns {number}
 */
export function arredondar(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100
}

/**
 * Soma as quantidades por item; linhas sem item são ignoradas.
 * @param {{item_ID?:string|null, qtdeItemPedido?:number|null}[]|null|undefined} itens linhas do pedido
 * @returns {Map<string, number>} item_ID -> quantidade total
 */
export function somarQuantidades(itens) {
  const totais = new Map()
  for (const { item_ID, qtdeItemPedido } of itens ?? []) {
    if (!item_ID) continue
    totais.set(item_ID, (totais.get(item_ID) ?? 0) + Number(qtdeItemPedido ?? 0))
  }
  return totais
}
