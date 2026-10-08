/**
 * Gera arquivos .xlsx mínimos para os testes (ZIP com deflate + SpreadsheetML).
 * opcoes.inline = true grava os textos como inlineStr (como o openpyxl).
 */
import { crc32, deflateRawSync } from 'node:zlib'

/** Célula: texto (sharedStrings ou inline) ou número. */
export type Celula = string | number

function escapar(texto: unknown): string {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function coluna(idx: number): string {
  let nome = ''
  for (let n = idx + 1; n > 0; n = Math.floor((n - 1) / 26)) nome = String.fromCharCode(65 + ((n - 1) % 26)) + nome
  return nome
}

export function gerarXlsx(linhas: Celula[][], { inline = false }: { inline?: boolean } = {}): Buffer {
  const compartilhados: string[] = []
  const indice = new Map<string, number>()
  const linhasXml = linhas.map((celulas, r) => {
    const cs = celulas.map((valor, c) => {
      const ref = `${coluna(c)}${r + 1}`
      if (typeof valor === 'number') return `<c r="${ref}"><v>${valor}</v></c>`
      if (inline) return `<c r="${ref}" t="inlineStr"><is><t>${escapar(valor)}</t></is></c>`
      if (!indice.has(valor)) { indice.set(valor, compartilhados.length); compartilhados.push(valor) }
      return `<c r="${ref}" t="s"><v>${indice.get(valor)}</v></c>`
    }).join('')
    return `<row r="${r + 1}">${cs}</row>`
  }).join('')

  const arquivos: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Dados" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${linhasXml}</sheetData></worksheet>`
  }
  if (!inline) {
    arquivos['xl/sharedStrings.xml'] = `<sst>${compartilhados.map(t => `<si><t>${escapar(t)}</t></si>`).join('')}</sst>`
  }
  return zipar(arquivos)
}

function zipar(arquivos: Record<string, string>): Buffer {
  const locais: Buffer[] = []
  const centrais: Buffer[] = []
  let deslocamento = 0
  for (const [nome, texto] of Object.entries(arquivos)) {
    const dados = Buffer.from(texto, 'utf8')
    const comprimido = deflateRawSync(dados)
    const nomeBytes = Buffer.from(nome, 'utf8')
    const crc = crc32(dados)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comprimido.length, 18)
    local.writeUInt32LE(dados.length, 22)
    local.writeUInt16LE(nomeBytes.length, 26)
    locais.push(local, nomeBytes, comprimido)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(comprimido.length, 20)
    central.writeUInt32LE(dados.length, 24)
    central.writeUInt16LE(nomeBytes.length, 28)
    central.writeUInt32LE(deslocamento, 42)
    centrais.push(central, nomeBytes)
    deslocamento += 30 + nomeBytes.length + comprimido.length
  }
  const diretorio = Buffer.concat(centrais)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(Object.keys(arquivos).length, 8)
  fim.writeUInt16LE(Object.keys(arquivos).length, 10)
  fim.writeUInt32LE(diretorio.length, 12)
  fim.writeUInt32LE(deslocamento, 16)
  return Buffer.concat([...locais, diretorio, fim])
}
