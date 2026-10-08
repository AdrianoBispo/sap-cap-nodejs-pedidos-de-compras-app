/**
 * Prepara um servidor CAP de teste (cds.test) com o ViaCEP falso e oferece
 * atalhos para chamadas OData autenticadas e para o fluxo de rascunho.
 */
import cds from '@sap/cds'
import { before, after } from 'node:test'
import { join } from 'node:path'
import { iniciarViaCepFalso } from './viacep-falso.js'

export const ADMIN = { auth: { username: 'admin', password: 'admin' } }
export const COMUM = { auth: { username: 'comum', password: 'comum' } }

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
      const { data } = await teste.post(`${caminho}/${entidade}(ID=${ID},IsActiveEntity=false)/${servico(caminho)}.draftActivate`, {}, opcoes)
      return data
    },

    /** Cria um rascunho de edição a partir da instância ativa. */
    async editar(caminho, entidade, ID, opcoes = ADMIN) {
      const { data } = await teste.post(`${caminho}/${entidade}(ID=${ID},IsActiveEntity=true)/${servico(caminho)}.draftEdit`, { PreserveChanges: true }, opcoes)
      return data
    }
  }
  return api
}

const SERVICOS = {
  '/odata/v4/clientes': 'ClientesService',
  '/odata/v4/estoque': 'EstoqueService',
  '/odata/v4/pedidos': 'PedidosService',
  '/odata/v4/reembolsos': 'ReembolsosService'
}
function servico(caminho) {
  return SERVICOS[caminho]
}

/** Captura o erro de uma chamada que deve falhar: { status, message, details }. */
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
