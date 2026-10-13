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
const cache = new Map<string, ResultadoCep>()

export interface EnderecoCep {
  logradouro: string
  bairro: string
  cidade: string
  uf: string
  estado: string
}

export interface ResultadoCep {
  valido: boolean
  indisponivel: boolean
  cepGeral: boolean
  endereco?: EnderecoCep
}

/** Configuração em cds.requires.viacep. */
interface ConfigViaCep {
  credentials?: { url?: string }
  timeout?: number
}

/** Corpo devolvido pelo ViaCEP. */
interface RespostaViaCep {
  erro?: boolean | string
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
  estado?: string
}

const INVALIDO: ResultadoCep = Object.freeze({ valido: false, indisponivel: false, cepGeral: false })
const INDISPONIVEL: ResultadoCep = Object.freeze({ valido: false, indisponivel: true, cepGeral: false })

/**
 * Consulta o CEP, com cache por processo. Só respostas definitivas (CEP
 * válido ou inexistente) entram no cache; indisponibilidade não.
 * @param cep CEP com ou sem máscara
 */
export async function consultarCep(cep: unknown): Promise<ResultadoCep> {
  const digitos = somenteDigitos(cep)
  if (digitos.length !== 8) return INVALIDO
  const emCache = cache.get(digitos)
  if (emCache) return emCache

  const resultado = await chamarServico(digitos)
  if (!resultado.indisponivel) {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!)
    cache.set(digitos, resultado)
  }
  return resultado
}

/**
 * Chama GET <url>/<cep>/json/ e traduz a resposta: 400/404 ou {"erro": true}
 * significam CEP inexistente; falha de rede, timeout, outros status HTTP
 * ou JSON inválido significam serviço indisponível. CEP sem logradouro é
 * CEP geral de município.
 * @param cep 8 dígitos
 */
async function chamarServico(cep: string): Promise<ResultadoCep> {
  const config: ConfigViaCep = cds.env.requires.viacep ?? {}
  const base = String(config.credentials?.url ?? 'https://viacep.com.br/ws').replace(/\/$/, '')
  let resposta: Response
  try {
    resposta = await fetch(`${base}/${cep}/json/`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(config.timeout ?? 5000)
    })
  } catch (erro) {
    LOG.warn('ViaCEP indisponível:', (erro as Error).message)
    return INDISPONIVEL
  }
  if (resposta.status === 400 || resposta.status === 404) return INVALIDO
  if (!resposta.ok) return INDISPONIVEL

  let json: RespostaViaCep
  try {
    json = await resposta.json() as RespostaViaCep
  } catch {
    return INDISPONIVEL
  }
  // CEP inexistente: {"erro": true} ou {"erro": "true"}
  if (json.erro || !json.localidade) return INVALIDO
  return {
    valido: true,
    indisponivel: false,
    cepGeral: !json.logradouro,
    endereco: {
      logradouro: json.logradouro ?? '',
      bairro: json.bairro ?? '',
      cidade: json.localidade,
      uf: json.uf ?? '',
      estado: json.estado || json.uf || ''
    }
  }
}
