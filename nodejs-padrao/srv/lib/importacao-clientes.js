/**
 * Importação de clientes por planilha: um cliente por linha, com o endereço
 * principal. Tudo ou nada. As linhas são validadas antes de gravar; a criação
 * passa pelo próprio serviço, então valem os handlers da tela (normalização,
 * consulta de CEP no ViaCEP, endereço principal, validações).
 */
import cds from '@sap/cds'
import { lerPlanilha, valor, paraData } from './planilha.js'
import {
  normalizarCpf, normalizarCep, converterCodelist, opcoesCodelist,
  falharImportacao, concluirImportacao, textosDoErro
} from './importacao.js'
import { validarCpf, validarEmail, validarTelefone, somenteDigitos, formatarCpf } from './util.js'
import { lerConteudo } from './requisicao.js'

const { SELECT, INSERT } = cds.ql

/** Colunas aceitas na planilha: nome do campo, sinônimos do cabeçalho e obrigatoriedade. */
const COLUNAS = [
  { campo: 'CPF', obrigatoria: true },
  { campo: 'Nome', sinonimos: ['NOMECOMPLETO', 'NOMEDOCLIENTE'], obrigatoria: true },
  { campo: 'E-mail', sinonimos: ['EMAILDOCLIENTE'], obrigatoria: true },
  { campo: 'Telefone', sinonimos: ['CELULAR', 'FONE', 'TELEFONECELULAR'], obrigatoria: true },
  { campo: 'Gênero', sinonimos: ['SEXO'] },
  { campo: 'Data de nascimento', sinonimos: ['NASCIMENTO', 'DATANASC', 'DATANASCIMENTO', 'DTNASCIMENTO'], obrigatoria: true },
  { campo: 'CEP', obrigatoria: true },
  { campo: 'Número', sinonimos: ['NUM', 'NRO', 'NUMEROENDERECO'], obrigatoria: true },
  { campo: 'Complemento' }
]

/**
 * Action importarPlanilha do ClientesService.
 *  1. Lê a planilha e valida todas as linhas sem gravar nada (CPF, nome,
 *     e-mail, telefone, gênero, nascimento, CEP e número; CPF repetido no
 *     arquivo ou já cadastrado).
 *  2. Havendo qualquer erro, falha a importação inteira com a lista de erros.
 *  3. Senão cria cada cliente pelo próprio serviço, com o endereço principal;
 *     um erro dos handlers (ex.: CEP inexistente) também desfaz tudo.
 * @param {import('@sap/cds').Request} req requisição da action (arquivo em base64)
 * @param {import('@sap/cds').Service} srv ClientesService
 * @returns {Promise<{registrosCriados:number, mensagem:string}|undefined>} undefined quando a importação falha
 */
export async function importarClientes(req, srv) {
  const db = cds.entities('pedidoscompras')
  const { registros, erros } = lerPlanilha(await lerConteudo(req.data.arquivo), COLUNAS)
  if (erros.length) return falharImportacao(req, erros)

  const cpfsCadastrados = new Set((await SELECT.from(db.Clientes).columns('cpf')).map(c => c.cpf))
  const cpfsArquivo = new Set()
  const hoje = new Date().toISOString().slice(0, 10)
  const clientes = []

  for (const reg of registros) {
    const pref = `Linha ${reg.linha}: `
    const antes = erros.length
    const cliente = { linha: reg.linha }

    const cpfTexto = valor(reg, 'CPF')
    cliente.cpf = normalizarCpf(cpfTexto)
    if (!validarCpf(cliente.cpf)) erros.push(`${pref}CPF inválido (${cpfTexto}).`)
    else if (cpfsCadastrados.has(cliente.cpf)) erros.push(`${pref}já existe cliente com o CPF ${formatarCpf(cliente.cpf)}.`)
    else if (cpfsArquivo.has(cliente.cpf)) erros.push(`${pref}CPF ${formatarCpf(cliente.cpf)} repetido na planilha.`)
    else cpfsArquivo.add(cliente.cpf)

    cliente.nome = valor(reg, 'Nome')
    if (!cliente.nome) erros.push(`${pref}Nome é obrigatório.`)
    else if (cliente.nome.length > 255) erros.push(`${pref}Nome excede 255 caracteres.`)

    cliente.email = valor(reg, 'E-mail').toLowerCase()
    if (!validarEmail(cliente.email)) erros.push(`${pref}E-mail inválido (${cliente.email}).`)
    else if (cliente.email.length > 100) erros.push(`${pref}E-mail excede 100 caracteres.`)

    cliente.telefone = somenteDigitos(valor(reg, 'Telefone'))
    if (!validarTelefone(cliente.telefone)) {
      erros.push(`${pref}Telefone deve ter 10 ou 11 dígitos (DDD + número).`)
    }

    const generoTexto = valor(reg, 'Gênero')
    if (generoTexto) {
      cliente.genero_code = await converterCodelist(db.Generos, generoTexto)
      if (!cliente.genero_code) erros.push(`${pref}Gênero inválido (${generoTexto}). Use: ${await opcoesCodelist(db.Generos)}.`)
    }

    const nascimentoTexto = valor(reg, 'Data de nascimento')
    cliente.dataNascimento = paraData(nascimentoTexto)
    if (!cliente.dataNascimento) {
      erros.push(`${pref}Data de nascimento inválida (${nascimentoTexto}). Use AAAA-MM-DD ou DD/MM/AAAA.`)
    } else if (cliente.dataNascimento > hoje) erros.push(`${pref}Data de nascimento não pode ser futura.`)

    cliente.cep = normalizarCep(valor(reg, 'CEP'))
    if (cliente.cep.length !== 8) erros.push(`${pref}CEP deve ter 8 dígitos.`)

    cliente.numero = valor(reg, 'Número')
    if (!cliente.numero) erros.push(`${pref}Número do endereço é obrigatório.`)
    else if (cliente.numero.length > 20) erros.push(`${pref}Número do endereço excede 20 caracteres.`)

    cliente.complemento = valor(reg, 'Complemento')
    if (cliente.complemento.length > 100) erros.push(`${pref}Complemento excede 100 caracteres.`)

    if (erros.length === antes) clientes.push(cliente)
  }
  if (erros.length) return falharImportacao(req, erros)

  // Criação pelo serviço: os handlers consultam o CEP (ViaCEP) e validam tudo
  const { Clientes } = srv.entities
  for (const { linha, cep, numero, complemento, ...dados } of clientes) {
    try {
      await srv.run(INSERT.into(Clientes).entries({ ...dados, enderecos: [{ cep, numero, complemento }] }))
    } catch (e) {
      for (const texto of textosDoErro(e, req.locale)) erros.push(`Linha ${linha}: ${texto}`)
      return falharImportacao(req, erros)
    }
  }
  return concluirImportacao(req, clientes.length)
}
