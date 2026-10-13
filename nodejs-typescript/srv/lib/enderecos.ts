/**
 * Endereços do cliente: preenchimento a partir do CEP (CEP já validado no
 * cadastro ou consulta ao ViaCEP) e validações dos endereços no Save do
 * cliente.
 */
import type { Request } from '@sap/cds'
import { Enderecos, StatusCep, type Endereco } from '#cds-models/pedidoscompras'
import { consultarCep } from './viacep.js'
import { somenteDigitos } from './util.js'
import { erro, aviso } from './mensagens.js'

/** Valores de Enderecos.cepStatus (tipo StatusCep do modelo). */
export const STATUS_CEP = Object.freeze({
  validado: StatusCep.Validado,
  invalido: StatusCep.Invalido,
  indisponivel: StatusCep.Indisponivel
} as const)

/** Campos do endereço preenchidos a partir do CEP. */
type DadosCep = Pick<Endereco, 'logradouro' | 'bairro' | 'cidade' | 'uf' | 'estado' | 'cepGeral' | 'cepStatus'>

/**
 * Preenche logradouro, bairro, cidade, UF, estado, cepGeral e cepStatus a
 * partir do CEP do endereço (altera o objeto). Reaproveita os dados de um
 * CEP já validado no cadastro e só consulta o ViaCEP para CEPs novos.
 * ViaCEP fora do ar gera um aviso e cepStatus X (o Save é barrado depois).
 * @param req requisição que recebe o aviso
 * @param endereco dados do endereço (cep normalizado para dígitos)
 */
export async function preencherEnderecoPorCep(req: Request, endereco: Endereco): Promise<void> {
  const cep = somenteDigitos(endereco.cep)
  endereco.cep = cep || null
  const dados: DadosCep = { logradouro: null, bairro: null, cidade: null, uf: null, estado: null, cepGeral: false, cepStatus: null }

  if (cep.length === 8) {
    const cadastrado = await SELECT.one.from(Enderecos)
      .columns('logradouro', 'bairro', 'cidade', 'uf', 'estado')
      .where({ cep, cepStatus: STATUS_CEP.validado, cepGeral: false })
    if (cadastrado) {
      const { logradouro, bairro, cidade, uf, estado } = cadastrado
      Object.assign(dados, { logradouro, bairro, cidade, uf, estado, cepStatus: STATUS_CEP.validado })
    } else {
      const resultado = await consultarCep(cep)
      if (resultado.indisponivel) {
        dados.cepStatus = STATUS_CEP.indisponivel
        aviso(req, 'CEP_INDISPONIVEL', {}, 'cep')
      } else if (resultado.valido) {
        Object.assign(dados, resultado.endereco, { cepGeral: resultado.cepGeral, cepStatus: STATUS_CEP.validado })
      } else dados.cepStatus = STATUS_CEP.invalido
    }
  } else if (cep) dados.cepStatus = STATUS_CEP.invalido

  Object.assign(endereco, dados)
}

/**
 * Valida os endereços enviados no Save do cliente (payload profundo): CEP
 * validado, logradouro/bairro obrigatórios para CEP geral e CEP único por
 * cliente. Garante exatamente um endereço principal (o primeiro, se
 * nenhum foi marcado). Endereço criado sem passar pelo rascunho (ex.:
 * importação) tem o CEP consultado aqui.
 * @param req requisição que recebe os erros
 * @param enderecos endereços do cliente (alterados)
 */
export async function validarEnderecosDoCliente(req: Request, enderecos: Endereco[] | null | undefined): Promise<void> {
  if (!Array.isArray(enderecos)) return
  const ceps = new Set<string>()
  for (const [idx, endereco] of enderecos.entries()) {
    // Endereço criado sem passar pelo rascunho (ex.: importação): consulta o CEP agora
    if (endereco.cep !== undefined && !endereco.cepStatus) await preencherEnderecoPorCep(req, endereco)
    const alvo = `enderecos(ID=${endereco.ID},IsActiveEntity=false)/cep`
    const cep = somenteDigitos(endereco.cep)
    if (cep.length !== 8) erro(req, 400, 'CEP_INVALIDO', {}, alvo)
    else if (endereco.cepStatus === STATUS_CEP.indisponivel) erro(req, 503, 'CEP_INDISPONIVEL', {}, alvo)
    else if (endereco.cepStatus !== STATUS_CEP.validado || !endereco.cidade || !endereco.uf) erro(req, 400, 'CEP_INVALIDO', {}, alvo)
    else if (endereco.cepGeral && !endereco.logradouro?.trim()) erro(req, 400, 'CAMPO_OBRIGATORIO', { campo: 'Logradouro' }, alvo)
    else if (endereco.cepGeral && !endereco.bairro?.trim()) erro(req, 400, 'CAMPO_OBRIGATORIO', { campo: 'Bairro' }, alvo)
    if (cep && ceps.has(cep)) erro(req, 409, 'CEP_DUPLICADO_CLIENTE', {}, alvo)
    ceps.add(cep)
    if (idx === 0 && !enderecos.some(e => e.principal)) endereco.principal = true
  }
  // Apenas um endereço principal por cliente
  let encontrado = false
  for (const endereco of enderecos) {
    if (endereco.principal && encontrado) endereco.principal = false
    else if (endereco.principal) encontrado = true
  }
}
