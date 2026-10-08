/**
 * Importação de clientes por planilha: um cliente por linha, com o endereço
 * principal. Tudo ou nada. As linhas são validadas antes de gravar; a criação
 * passa pelo próprio serviço, então valem os handlers da tela (normalização,
 * consulta de CEP no ViaCEP, endereço principal, validações).
 */
import type { Request, Service } from '@sap/cds'
import type { CdsDate } from '#cds-models/_'
import { Clientes, Generos, type ResultadoImportacao } from '#cds-models/pedidoscompras'
import { Clientes as ClientesServico } from '#cds-models/ClientesService'
import { lerPlanilha, valor, paraData, type Coluna } from './planilha.js'
import {
  normalizarCpf, normalizarCep, converterCodelist, opcoesCodelist,
  falharImportacao, concluirImportacao, textosDoErro
} from './importacao.js'
import { validarCpf, validarEmail, somenteDigitos, formatarCpf } from './util.js'
import { lerConteudo } from './requisicao.js'

const COLUNAS: Coluna[] = [
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

/** Parâmetros da action importarPlanilha. */
export interface ParametrosImportacao {
  arquivo?: unknown
  nomeArquivo?: string | null
}

/** Cliente validado, pronto para ser criado pelo serviço. */
interface ClienteImportado {
  linha: number
  cpf: string
  nome: string
  email: string
  telefone: string
  genero_code?: string | null
  dataNascimento: CdsDate | null
  cep: string
  numero: string
  complemento: string
}

export async function importarClientes(req: Request<ParametrosImportacao>, srv: Service): Promise<ResultadoImportacao | undefined> {
  const { registros, erros } = lerPlanilha(await lerConteudo(req.data.arquivo), COLUNAS)
  if (erros.length) return falharImportacao(req, erros)

  const cpfsCadastrados = new Set((await SELECT.from(Clientes).columns('cpf')).map(c => c.cpf))
  const cpfsArquivo = new Set<string>()
  const hoje = new Date().toISOString().slice(0, 10)
  const clientes: ClienteImportado[] = []

  for (const reg of registros) {
    const pref = `Linha ${reg.linha}: `
    const antes = erros.length

    const cpfTexto = valor(reg, 'CPF')
    const cpf = normalizarCpf(cpfTexto)
    if (!validarCpf(cpf)) erros.push(`${pref}CPF inválido (${cpfTexto}).`)
    else if (cpfsCadastrados.has(cpf)) erros.push(`${pref}já existe cliente com o CPF ${formatarCpf(cpf)}.`)
    else if (cpfsArquivo.has(cpf)) erros.push(`${pref}CPF ${formatarCpf(cpf)} repetido na planilha.`)
    else cpfsArquivo.add(cpf)

    const nome = valor(reg, 'Nome')
    if (!nome) erros.push(`${pref}Nome é obrigatório.`)
    else if (nome.length > 255) erros.push(`${pref}Nome excede 255 caracteres.`)

    const email = valor(reg, 'E-mail').toLowerCase()
    if (!validarEmail(email)) erros.push(`${pref}E-mail inválido (${email}).`)
    else if (email.length > 100) erros.push(`${pref}E-mail excede 100 caracteres.`)

    const telefone = somenteDigitos(valor(reg, 'Telefone'))
    if (telefone.length < 10 || telefone.length > 11) {
      erros.push(`${pref}Telefone deve ter 10 ou 11 dígitos (DDD + número).`)
    }

    let genero_code: string | null | undefined
    const generoTexto = valor(reg, 'Gênero')
    if (generoTexto) {
      genero_code = await converterCodelist(Generos, generoTexto)
      if (!genero_code) erros.push(`${pref}Gênero inválido (${generoTexto}). Use: ${await opcoesCodelist(Generos)}.`)
    }

    const nascimentoTexto = valor(reg, 'Data de nascimento')
    const dataNascimento = paraData(nascimentoTexto) as CdsDate | null
    if (!dataNascimento) {
      erros.push(`${pref}Data de nascimento inválida (${nascimentoTexto}). Use AAAA-MM-DD ou DD/MM/AAAA.`)
    } else if (dataNascimento > hoje) erros.push(`${pref}Data de nascimento não pode ser futura.`)

    const cep = normalizarCep(valor(reg, 'CEP'))
    if (cep.length !== 8) erros.push(`${pref}CEP deve ter 8 dígitos.`)

    const numero = valor(reg, 'Número')
    if (!numero) erros.push(`${pref}Número do endereço é obrigatório.`)
    else if (numero.length > 20) erros.push(`${pref}Número do endereço excede 20 caracteres.`)

    const complemento = valor(reg, 'Complemento')
    if (complemento.length > 100) erros.push(`${pref}Complemento excede 100 caracteres.`)

    if (erros.length === antes) {
      clientes.push({ linha: reg.linha, cpf, nome, email, telefone, genero_code, dataNascimento, cep, numero, complemento })
    }
  }
  if (erros.length) return falharImportacao(req, erros)

  // Criação pelo serviço: os handlers consultam o CEP (ViaCEP) e validam tudo
  for (const { linha, cep, numero, complemento, ...dados } of clientes) {
    try {
      await srv.run(INSERT.into(ClientesServico).entries({ ...dados, enderecos: [{ cep, numero, complemento }] }))
    } catch (e) {
      for (const texto of textosDoErro(e, req.locale)) erros.push(`Linha ${linha}: ${texto}`)
      return falharImportacao(req, erros)
    }
  }
  return concluirImportacao(req, clientes.length)
}
