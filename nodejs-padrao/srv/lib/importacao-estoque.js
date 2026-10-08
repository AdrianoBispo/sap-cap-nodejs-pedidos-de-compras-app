/**
 * Importação de itens de estoque por planilha: um item por linha, criado
 * ativo e com SKU gerado na hora. Tudo ou nada. Um nome já cadastrado (ou
 * repetido na planilha) é erro, o que evita duplicar o estoque ao reenviar
 * o mesmo arquivo.
 */
import cds from '@sap/cds'
import { lerPlanilha, valor, paraDecimal, paraInteiro } from './planilha.js'
import { converterCodelist, opcoesCodelist, falharImportacao, concluirImportacao, textosDoErro } from './importacao.js'
import { lerConteudo } from './requisicao.js'

const { SELECT, INSERT } = cds.ql

const COLUNAS = [
  { campo: 'Nome', sinonimos: ['NOMEDOITEM', 'PRODUTO', 'NOMEDOPRODUTO'], obrigatoria: true },
  { campo: 'Descrição' },
  { campo: 'Categoria', obrigatoria: true },
  { campo: 'Quantidade em estoque', sinonimos: ['ESTOQUE', 'QTDEESTOQUE', 'QUANTIDADE', 'QTDE', 'QUANTIDADEESTOQUE'], obrigatoria: true },
  { campo: 'Preço unitário', sinonimos: ['PRECO', 'VALOR', 'VALORUNITARIO', 'PRECOUNIT'], obrigatoria: true },
  { campo: 'Moeda', sinonimos: ['CURRENCY', 'MOEDACODIGO'] }
]

export async function importarItens(req, srv) {
  const db = cds.entities('pedidoscompras')
  const { Currencies } = cds.entities('sap.common')
  const { registros, erros } = lerPlanilha(await lerConteudo(req.data.arquivo), COLUNAS)
  if (erros.length) return falharImportacao(req, erros)

  const nomesCadastrados = new Set((await SELECT.from(db.Itens).columns('nome')).map(i => i.nome))
  const moedas = new Set((await SELECT.from(Currencies).columns('code')).map(m => m.code))
  const nomesArquivo = new Set()
  const itens = []

  for (const reg of registros) {
    const pref = `Linha ${reg.linha}: `
    const antes = erros.length
    const item = { linha: reg.linha }

    item.nome = valor(reg, 'Nome')
    if (!item.nome) erros.push(`${pref}Nome é obrigatório.`)
    else if (item.nome.length > 120) erros.push(`${pref}Nome excede 120 caracteres.`)
    else if (nomesCadastrados.has(item.nome)) erros.push(`${pref}item "${item.nome}" já cadastrado.`)
    else if (nomesArquivo.has(item.nome.toUpperCase())) erros.push(`${pref}item "${item.nome}" repetido na planilha.`)
    else nomesArquivo.add(item.nome.toUpperCase())

    item.descricao = valor(reg, 'Descrição')
    if (item.descricao.length > 500) erros.push(`${pref}Descrição excede 500 caracteres.`)

    const categoriaTexto = valor(reg, 'Categoria')
    item.categoria_code = await converterCodelist(db.Categorias, categoriaTexto)
    if (!item.categoria_code) {
      erros.push(`${pref}Categoria inválida (${categoriaTexto}). Use: ${await opcoesCodelist(db.Categorias)}.`)
    }

    const estoqueTexto = valor(reg, 'Quantidade em estoque')
    item.qtdeEstoque = paraInteiro(estoqueTexto)
    if (item.qtdeEstoque === null || item.qtdeEstoque < 0) {
      erros.push(`${pref}Quantidade em estoque inválida (${estoqueTexto}). Use um número inteiro maior ou igual a zero.`)
    }

    const precoTexto = valor(reg, 'Preço unitário')
    item.precoUnitario = paraDecimal(precoTexto)
    if (item.precoUnitario === null || item.precoUnitario < 0) erros.push(`${pref}Preço unitário inválido (${precoTexto}).`)

    item.currency_code = (valor(reg, 'Moeda') || 'BRL').toUpperCase()
    if (!moedas.has(item.currency_code)) erros.push(`${pref}Moeda inválida (${item.currency_code}).`)

    if (erros.length === antes) itens.push(item)
  }
  if (erros.length) return falharImportacao(req, erros)

  const { Itens } = srv.entities
  for (const { linha, ...dados } of itens) {
    try {
      await srv.run(INSERT.into(Itens).entries(dados))
    } catch (e) {
      for (const texto of textosDoErro(e, req.locale)) erros.push(`Linha ${linha}: ${texto}`)
      return falharImportacao(req, erros)
    }
  }
  return concluirImportacao(req, itens.length)
}
