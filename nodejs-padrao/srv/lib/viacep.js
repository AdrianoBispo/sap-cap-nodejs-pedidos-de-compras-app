/**
 * Consulta de CEP no ViaCEP.
 *
 * A URL vem de cds.requires.viacep.credentials.url (package.json), o que
 * permite apontar para outro endpoint por perfil ou variável de ambiente
 * (cds_requires_viacep_credentials_url). Respostas definitivas ficam em cache
 * por processo (limitado a 100 entradas); indisponibilidade não é cacheada.
 */
import cds from '@sap/cds'
import { somenteDigitos } from './util.js'

const LOG = cds.log('viacep')
const MAX_CACHE = 100
const cache = new Map()

/**
 * Consulta o CEP, com cache por processo. Só respostas definitivas (CEP
 * válido ou inexistente) entram no cache; indisponibilidade não.
 * @param {unknown} cep CEP com ou sem máscara
 * @returns {Promise<{valido:boolean, indisponivel:boolean, cepGeral:boolean,
 *   endereco?:{logradouro:string,bairro:string,cidade:string,uf:string,estado:string}}>}
 */
export async function consultarCep(cep) {
  const digitos = somenteDigitos(cep)
  if (digitos.length !== 8) return { valido: false, indisponivel: false, cepGeral: false }
  if (cache.has(digitos)) return cache.get(digitos)

  const resultado = await chamarServico(digitos)
  if (!resultado.indisponivel) {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value)
    cache.set(digitos, resultado)
  }
  return resultado
}

/**
 * Chama GET <url>/<cep>/json/ e traduz a resposta: 400/404 ou {"erro": true}
 * significam CEP inexistente; falha de rede, timeout, outros status HTTP
 * ou JSON inválido significam serviço indisponível. CEP sem logradouro é
 * CEP geral de município.
 * @param {string} cep 8 dígitos
 */
async function chamarServico(cep) {
  const config = cds.env.requires.viacep ?? {}
  const base = String(config.credentials?.url ?? 'https://viacep.com.br/ws').replace(/\/$/, '')
  let resposta
  try {
    resposta = await fetch(`${base}/${cep}/json/`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(config.timeout ?? 5000)
    })
  } catch (erro) {
    LOG.warn('ViaCEP indisponível:', erro.message)
    return { valido: false, indisponivel: true, cepGeral: false }
  }
  if (resposta.status === 400 || resposta.status === 404) return { valido: false, indisponivel: false, cepGeral: false }
  if (!resposta.ok) return { valido: false, indisponivel: true, cepGeral: false }

  let json
  try {
    json = await resposta.json()
  } catch {
    return { valido: false, indisponivel: true, cepGeral: false }
  }
  // CEP inexistente: {"erro": true} ou {"erro": "true"}
  if (json.erro || !json.localidade) return { valido: false, indisponivel: false, cepGeral: false }
  return {
    valido: true,
    indisponivel: false,
    cepGeral: !json.logradouro,
    endereco: {
      logradouro: json.logradouro ?? '',
      bairro: json.bairro ?? '',
      cidade: json.localidade,
      uf: json.uf,
      estado: json.estado || json.uf
    }
  }
}
