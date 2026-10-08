/**
 * Leitura de planilhas .xlsx e .csv para a importação em massa
 * (porte de ZCL_PC_PLANILHA).
 *
 *  - XLSX: lido sem bibliotecas externas (ZIP via zlib nativo + XML da
 *    primeira aba). Aceita textos compartilhados (sharedStrings) e textos
 *    "inline" (inlineStr), inclusive arquivos gerados pelo LibreOffice.
 *  - CSV: separador ";", "," ou tabulação (detectado pelo cabeçalho), UTF-8
 *    com ou sem BOM; se não for UTF-8 válido, assume Windows-1252/ISO-8859-1.
 *  - A primeira linha não vazia é o cabeçalho. Os nomes de coluna são
 *    comparados sem acentos, espaços, pontuação ou diferença de caixa, e cada
 *    coluna aceita sinônimos. Colunas extras são ignoradas.
 */
import { TextDecoder } from 'node:util'
import { inflateRawSync } from 'node:zlib'

export const MAX_LINHAS = 500

/** "Data de nascimento" -> "DATADENASCIMENTO". */
export function normalizarNome(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Lê a planilha e devolve os registros por nome de campo.
 * @param {Buffer} conteudo
 * @param {{campo:string, sinonimos?:string[], obrigatoria?:boolean}[]} colunas
 * @returns {{registros:{linha:number, valores:Record<string,string>}[], erros:string[]}}
 */
export function lerPlanilha(conteudo, colunas) {
  if (!conteudo?.length) return { registros: [], erros: ['O arquivo está vazio.'] }
  let linhas
  try {
    if (conteudo.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) linhas = lerXlsx(conteudo)
    else if (conteudo.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) {
      return { registros: [], erros: ['Arquivos .xls (formato antigo do Excel) não são aceitos. Salve como .xlsx ou .csv.'] }
    } else linhas = lerCsv(conteudo)
  } catch (e) {
    return { registros: [], erros: [`Não foi possível ler a planilha: ${e.message}`] }
  }
  return mapearRegistros(linhas, colunas)
}

/** Valor (texto sem espaços nas pontas) de um campo do registro. */
export function valor(registro, campo) {
  return String(registro.valores[campo] ?? '').trim()
}

/** AAAA-MM-DD, DD/MM/AAAA ou número de série do Excel -> 'AAAA-MM-DD' (ou null). */
export function paraData(texto) {
  const t = String(texto ?? '').trim()
  let ano, mes, dia
  let m
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/))) [, ano, mes, dia] = m
  else if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [, dia, mes, ano] = m
  else if (/^\d{1,6}(\.\d+)?$/.test(t)) {
    const serial = Math.floor(Number(t))
    if (serial < 1) return null
    const data = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
    return data.toISOString().slice(0, 10)
  } else return null
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)))
  if (data.getUTCFullYear() !== Number(ano) || data.getUTCMonth() !== Number(mes) - 1 || data.getUTCDate() !== Number(dia)) return null
  return data.toISOString().slice(0, 10)
}

/** "1.234,56", "1234,56" ou "1234.56" -> 1234.56 (ou null). */
export function paraDecimal(texto) {
  let t = String(texto ?? '').trim().replace(/^R\$\s*/i, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}

/** Inteiro (aceita "10", "10.0" ou "10,0"); null se não for inteiro. */
export function paraInteiro(texto) {
  const numero = paraDecimal(texto)
  return numero !== null && Number.isInteger(numero) ? numero : null
}

// ---------------------------------------------------------------------------
// Cabeçalho e registros
// ---------------------------------------------------------------------------

function mapearRegistros(linhas, colunas) {
  const erros = []
  const naoVazias = linhas.filter(l => l.celulas.some(c => String(c ?? '').trim() !== ''))
  if (!naoVazias.length) return { registros: [], erros: ['A planilha não possui cabeçalho nem linhas de dados.'] }

  const [cabecalho, ...dados] = naoVazias
  const indices = new Map()
  cabecalho.celulas.forEach((nome, idx) => {
    const normalizado = normalizarNome(nome)
    const coluna = colunas.find(c => normalizarNome(c.campo) === normalizado || (c.sinonimos ?? []).includes(normalizado))
    if (coluna && !indices.has(coluna.campo)) indices.set(coluna.campo, idx)
  })
  for (const coluna of colunas) {
    if (coluna.obrigatoria && !indices.has(coluna.campo)) erros.push(`Coluna obrigatória ausente: ${coluna.campo}.`)
  }
  if (!dados.length) erros.push('A planilha não possui linhas de dados.')
  if (dados.length > MAX_LINHAS) erros.push(`A planilha tem ${dados.length} linhas; o máximo é ${MAX_LINHAS}.`)
  if (erros.length) return { registros: [], erros }

  const registros = dados.map(l => ({
    linha: l.numero,
    valores: Object.fromEntries([...indices].map(([campo, idx]) => [campo, String(l.celulas[idx] ?? '').trim()]))
  }))
  return { registros, erros }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function lerCsv(conteudo) {
  let texto
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(conteudo)
  } catch {
    texto = new TextDecoder('windows-1252').decode(conteudo)
  }
  texto = texto.replace(/^\uFEFF/, '')
  const primeira = texto.split(/\r?\n/).find(l => l.trim() !== '') ?? ''
  const separador = [';', ',', '\t'].reduce((melhor, sep) =>
    contarForaDeAspas(primeira, sep) > contarForaDeAspas(primeira, melhor) ? sep : melhor, ';')

  const linhas = []
  let celulas = []
  let atual = ''
  let entreAspas = false
  let numero = 1
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (entreAspas) {
      if (c === '"' && texto[i + 1] === '"') { atual += '"'; i++ } else if (c === '"') entreAspas = false
      else atual += c
    } else if (c === '"') entreAspas = true
    else if (c === separador) { celulas.push(atual); atual = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      celulas.push(atual)
      linhas.push({ numero, celulas })
      numero++
      celulas = []
      atual = ''
    } else atual += c
  }
  if (atual !== '' || celulas.length) {
    celulas.push(atual)
    linhas.push({ numero, celulas })
  }
  return linhas
}

function contarForaDeAspas(linha, separador) {
  let total = 0
  let entreAspas = false
  for (const c of linha) {
    if (c === '"') entreAspas = !entreAspas
    else if (c === separador && !entreAspas) total++
  }
  return total
}

// ---------------------------------------------------------------------------
// XLSX (ZIP + SpreadsheetML)
// ---------------------------------------------------------------------------

function lerZip(buffer) {
  let eocd = buffer.length - 22
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('arquivo ZIP inválido')
  const total = buffer.readUInt16LE(eocd + 10)
  let pos = buffer.readUInt32LE(eocd + 16)
  const arquivos = new Map()
  for (let n = 0; n < total; n++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) throw new Error('diretório ZIP inválido')
    const metodo = buffer.readUInt16LE(pos + 10)
    const tamanho = buffer.readUInt32LE(pos + 20)
    const tamNome = buffer.readUInt16LE(pos + 28)
    const tamExtra = buffer.readUInt16LE(pos + 30)
    const tamComentario = buffer.readUInt16LE(pos + 32)
    const local = buffer.readUInt32LE(pos + 42)
    const nome = buffer.toString('utf8', pos + 46, pos + 46 + tamNome)
    const inicio = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    const dados = buffer.subarray(inicio, inicio + tamanho)
    arquivos.set(nome, () => (metodo === 0 ? dados : metodo === 8 ? inflateRawSync(dados) : null))
    pos += 46 + tamNome + tamExtra + tamComentario
  }
  return {
    ler(nome) {
      const fn = arquivos.get(nome)
      const bytes = fn?.()
      return bytes ? bytes.toString('utf8') : null
    }
  }
}

function decodificarXml(texto) {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Concatena os <t> de um trecho (texto simples ou rich text), sem a fonética (<rPh>). */
function textoDe(xml) {
  const semFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  return [...semFonetica.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => decodificarXml(m[1])).join('')
}

function indiceColuna(referencia) {
  const letras = String(referencia).match(/^[A-Z]+/)?.[0] ?? 'A'
  return [...letras].reduce((acc, l) => acc * 26 + (l.charCodeAt(0) - 64), 0) - 1
}

function lerXlsx(conteudo) {
  const zip = lerZip(conteudo)
  const compartilhados = []
  const sst = zip.ler('xl/sharedStrings.xml')
  if (sst) for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) compartilhados.push(textoDe(m[1]))

  const caminho = primeiraAba(zip)
  const xml = zip.ler(caminho)
  if (!xml) throw new Error('a planilha não possui abas')

  const linhas = []
  for (const m of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const numero = Number(m[1].match(/\br="(\d+)"/)?.[1] ?? linhas.length + 1)
    const celulas = []
    for (const c of (m[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atributos = c[1]
      const corpo = c[2] ?? ''
      const idx = indiceColuna(atributos.match(/\br="([A-Z]+)\d*"/)?.[1] ?? '')
      const tipo = atributos.match(/\bt="(\w+)"/)?.[1] ?? 'n'
      const v = corpo.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      celulas[idx] = tipo === 's' ? compartilhados[Number(v)] ?? ''
        : tipo === 'inlineStr' ? textoDe(corpo.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? '')
          : tipo === 'b' ? (v === '1' ? 'true' : 'false')
            : v !== undefined ? decodificarXml(v) : ''
    }
    linhas.push({ numero, celulas: Array.from(celulas, c => c ?? '') })
  }
  return linhas
}

function primeiraAba(zip) {
  const workbook = zip.ler('xl/workbook.xml')
  const rels = zip.ler('xl/_rels/workbook.xml.rels')
  const rid = workbook?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1]
  if (rid && rels) {
    const rel = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map(r => r[1]).find(a => a.includes(`Id="${rid}"`))
    const alvo = rel?.match(/Target="([^"]+)"/)?.[1]
    if (alvo) return alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo}`
  }
  return 'xl/worksheets/sheet1.xml'
}
