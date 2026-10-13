/**
 * Importação de itens de estoque por planilha: um item por linha, criado
 * ativo e com SKU gerado na hora. Tudo ou nada. Um nome já cadastrado ou
 * repetido na planilha (sem diferenciar maiúsculas de minúsculas) é erro, o
 * que evita duplicar o estoque ao reenviar o mesmo arquivo.
 */
import type { Request, Service } from '@sap/cds'
import { Categorias, Itens, type ResultadoImportacao } from '#cds-models/pedidoscompras'
import { Currencies } from '#cds-models/sap/common'
import { Itens as ItensServico } from '#cds-models/EstoqueService'
import { lerPlanilha, valor, paraDecimal, paraInteiro, type Coluna } from './planilha.js'
import { converterCodelist, opcoesCodelist, falharImportacao, concluirImportacao, textosDoErro } from './importacao.js'
import type { ParametrosImportacao } from './importacao-clientes.js'
import { lerConteudo } from './requisicao.js'

/** Colunas aceitas na planilha: nome do campo, sinônimos do cabeçalho e obrigatoriedade. */
const COLUNAS: Coluna[] = [
  { campo: 'Nome', sinonimos: ['NOMEDOITEM', 'PRODUTO', 'NOMEDOPRODUTO'], obrigatoria: true },
  { campo: 'Descrição' },
  { campo: 'Categoria', obrigatoria: true },
  { campo: 'Quantidade em estoque', sinonimos: ['ESTOQUE', 'QTDEESTOQUE', 'QUANTIDADE', 'QTDE', 'QUANTIDADEESTOQUE'], obrigatoria: true },
  { campo: 'Preço unitário', sinonimos: ['PRECO', 'VALOR', 'VALORUNITARIO', 'PRECOUNIT'], obrigatoria: true },
  { campo: 'Moeda', sinonimos: ['CURRENCY', 'MOEDACODIGO'] }
]

/** Item validado, pronto para ser criado pelo serviço. */
interface ItemImportado {
  linha: number
  nome: string
  descricao: string
  categoria_code: string | null
  qtdeEstoque: number | null
  precoUnitario: number | null
  currency_code: string
}

/**
 * Action importarPlanilha do EstoqueService.
 *  1. Lê a planilha e valida todas as linhas sem gravar nada (nome único,
 *     descrição, categoria, quantidade, preço e moeda).
 *  2. Havendo qualquer erro, falha a importação inteira com a lista de erros.
 *  3. Senão cria cada item pelo próprio serviço (SKU gerado no Save).
 * @param req requisição da action (arquivo em base64)
 * @param srv EstoqueService
 * @returns undefined quando a importação falha
 */
export async function importarItens(req: Request<ParametrosImportacao>, srv: Service): Promise<ResultadoImportacao | undefined> {
  const { registros, erros } = lerPlanilha(await lerConteudo(req.data.arquivo), COLUNAS)
  if (erros.length) return falharImportacao(req, erros)

  const nomesCadastrados = new Set((await SELECT.from(Itens).columns('nome')).map(i => String(i.nome ?? '').toUpperCase()))
  const moedas = new Set((await SELECT.from(Currencies).columns('code')).map(m => m.code))
  const nomesArquivo = new Set<string>()
  const itens: ItemImportado[] = []

  for (const reg of registros) {
    const pref = `Linha ${reg.linha}: `
    const antes = erros.length

    const nome = valor(reg, 'Nome')
    if (!nome) erros.push(`${pref}Nome é obrigatório.`)
    else if (nome.length > 120) erros.push(`${pref}Nome excede 120 caracteres.`)
    else if (nomesCadastrados.has(nome.toUpperCase())) erros.push(`${pref}item "${nome}" já cadastrado.`)
    else if (nomesArquivo.has(nome.toUpperCase())) erros.push(`${pref}item "${nome}" repetido na planilha.`)
    else nomesArquivo.add(nome.toUpperCase())

    const descricao = valor(reg, 'Descrição')
    if (descricao.length > 500) erros.push(`${pref}Descrição excede 500 caracteres.`)

    const categoriaTexto = valor(reg, 'Categoria')
    const categoria_code = await converterCodelist(Categorias, categoriaTexto)
    if (!categoria_code) {
      erros.push(`${pref}Categoria inválida (${categoriaTexto}). Use: ${await opcoesCodelist(Categorias)}.`)
    }

    const estoqueTexto = valor(reg, 'Quantidade em estoque')
    const qtdeEstoque = paraInteiro(estoqueTexto)
    if (qtdeEstoque === null || qtdeEstoque < 0) {
      erros.push(`${pref}Quantidade em estoque inválida (${estoqueTexto}). Use um número inteiro maior ou igual a zero.`)
    }

    const precoTexto = valor(reg, 'Preço unitário')
    const precoUnitario = paraDecimal(precoTexto)
    if (precoUnitario === null || precoUnitario < 0) erros.push(`${pref}Preço unitário inválido (${precoTexto}).`)

    const currency_code = (valor(reg, 'Moeda') || 'BRL').toUpperCase()
    if (!moedas.has(currency_code)) erros.push(`${pref}Moeda inválida (${currency_code}).`)

    if (erros.length === antes) {
      itens.push({ linha: reg.linha, nome, descricao, categoria_code, qtdeEstoque, precoUnitario, currency_code })
    }
  }
  if (erros.length) return falharImportacao(req, erros)

  for (const { linha, ...dados } of itens) {
    try {
      await srv.run(INSERT.into(ItensServico).entries(dados))
    } catch (e) {
      for (const texto of textosDoErro(e, req.locale)) erros.push(`Linha ${linha}: ${texto}`)
      return falharImportacao(req, erros)
    }
  }
  return concluirImportacao(req, itens.length)
}
