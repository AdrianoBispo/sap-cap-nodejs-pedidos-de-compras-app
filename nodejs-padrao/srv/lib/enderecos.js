/**
 * Endereços do cliente: preenchimento pelo CEP e validações de gravação
 * (porte de PreencherEnderecoViaCep, ValidarCep, ValidarCepUnico,
 * ValidarNumero e DefinirPrincipalInicial do BO Cliente).
 */
import cds from '@sap/cds'
import { consultarCep } from './viacep.js'
import { somenteDigitos } from './util.js'
import { erro, aviso } from './mensagens.js'

const { SELECT } = cds.ql

export const STATUS_CEP = Object.freeze({ validado: 'V', invalido: 'I', indisponivel: 'X' })

/**
 * Preenche logradouro, bairro, cidade, UF, estado, cepGeral e cepStatus a
 * partir do CEP de "endereco" (altera o objeto). Reaproveita os dados de um
 * CEP já validado no cadastro e só consulta o ViaCEP para CEPs desconhecidos.
 */
export async function preencherEnderecoPorCep(req, endereco) {
  const cep = somenteDigitos(endereco.cep)
  endereco.cep = cep || null
  const dados = { logradouro: null, bairro: null, cidade: null, uf: null, estado: null, cepGeral: false, cepStatus: null }

  if (cep.length === 8) {
    const { Enderecos } = cds.entities('pedidoscompras')
    const cadastrado = await SELECT.one.from(Enderecos)
      .columns('logradouro', 'bairro', 'cidade', 'uf', 'estado')
      .where({ cep, cepStatus: STATUS_CEP.validado, cepGeral: false })
    if (cadastrado) Object.assign(dados, cadastrado, { cepStatus: STATUS_CEP.validado })
    else {
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
 * Validações dos endereços enviados no Save do cliente (payload profundo):
 * CEP validado, logradouro/bairro para CEP geral, CEP único por cliente e
 * exatamente um endereço principal.
 */
export async function validarEnderecosDoCliente(req, enderecos) {
  if (!Array.isArray(enderecos)) return
  const ceps = new Set()
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
