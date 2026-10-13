/**
 * Prepara um servidor CAP de teste (cds.test) com o ViaCEP falso e oferece
 * atalhos para chamadas OData autenticadas e para o fluxo de rascunho.
 */
import cds from '@sap/cds'
import { before, after } from 'node:test'
import { join } from 'node:path'
import { iniciarViaCepFalso } from './viacep-falso.js'

/** Credenciais do usuário administrador (papel Admin). */
export const ADMIN = { auth: { username: 'admin', password: 'admin' } }
/** Credenciais do usuário comum (papel Comum: só consulta cadastros). */
export const COMUM = { auth: { username: 'comum', password: 'comum' } }

/**
 * Sobe o servidor CAP do projeto (cds.test) apontando o ViaCEP para o
 * servidor falso. Devolve atalhos HTTP autenticados (ADMIN por padrão) e
 * do fluxo de rascunho (ativar, editar).
 */
export function iniciarServidor() {
  const teste = cds.test(join(import.meta.dirname, '..', '..'))
  const viacep = {}
  before(async () => {
    Object.assign(viacep, await iniciarViaCepFalso())
    cds.env.requires.viacep.credentials.url = viacep.url
  })
  after(() => viacep.fechar?.())

  const api = {
    teste,
    viacep,
    get: (url, opcoes = ADMIN) => teste.get(url, opcoes),
    post: (url, dados = {}, opcoes = ADMIN) => teste.post(url, dados, opcoes),
    patch: (url, dados, opcoes = ADMIN) => teste.patch(url, dados, opcoes),
    put: (url, dados, opcoes = ADMIN) => teste.put(url, dados, opcoes),
    del: (url, opcoes = ADMIN) => teste.delete(url, opcoes),

    /** Chave OData de rascunho ou ativa. */
    chave: (ID, ativo = true) => `(ID=${ID},IsActiveEntity=${ativo})`,

    /** Ativa (Salvar) o rascunho e devolve a instância ativa. */
    async ativar(caminho, entidade, ID, opcoes = ADMIN) {
      const { data } = await teste.post(`${caminho}/${entidade}(ID=${ID},IsActiveEntity=false)/${SERVICOS[caminho]}.draftActivate`, {}, opcoes)
      return data
    },

    /** Cria um rascunho de edição a partir da instância ativa. */
    async editar(caminho, entidade, ID, opcoes = ADMIN) {
      const { data } = await teste.post(`${caminho}/${entidade}(ID=${ID},IsActiveEntity=true)/${SERVICOS[caminho]}.draftEdit`, { PreserveChanges: true }, opcoes)
      return data
    }
  }
  return api
}

/** Nome do serviço CDS por caminho OData (prefixo das actions de rascunho). */
const SERVICOS = {
  '/odata/v4/clientes': 'ClientesService',
  '/odata/v4/estoque': 'EstoqueService',
  '/odata/v4/pedidos': 'PedidosService',
  '/odata/v4/reembolsos': 'ReembolsosService'
}

/**
 * Aguarda uma chamada que deve falhar e devolve o erro normalizado:
 * { status, message, details, codes }. Lança se a chamada tiver sucesso.
 * @param {Promise<unknown>} promessa
 */
export async function falha(promessa) {
  try {
    await promessa
  } catch (e) {
    const corpo = e.response?.data?.error ?? e.data?.error ?? {}
    return {
      status: e.response?.status ?? e.status ?? e.code,
      message: corpo.message ?? e.message,
      details: corpo.details ?? [],
      codes: [corpo.code, ...(corpo.details ?? []).map(d => d.code)].filter(Boolean)
    }
  }
  throw new Error('A chamada deveria ter falhado')
}
