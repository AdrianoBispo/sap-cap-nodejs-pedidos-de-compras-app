/**
 * Prepara um servidor CAP de teste (cds.test) com o ViaCEP falso e oferece
 * atalhos para chamadas OData autenticadas e para o fluxo de rascunho.
 */
import cds from '@sap/cds'
import { before, after } from 'node:test'
import { join } from 'node:path'
import { iniciarViaCepFalso, type ViaCepFalso } from './viacep-falso.js'

/** Opções de chamada HTTP (credenciais e cabeçalhos). */
export interface Opcoes {
  auth: { username: string, password: string }
  headers?: Record<string, string>
}

/**
 * Resposta HTTP do cds.test. O corpo é o JSON devolvido pelo OData, sem tipo
 * fixo: cada teste confere apenas os campos que interessam.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON livre das respostas OData
export interface Resposta<T = any> {
  status: number
  data: T
}

/** Erro de uma chamada que deveria falhar. */
export interface Falha {
  status: number
  message: string
  details: { code?: string, message?: string }[]
  codes: string[]
}

/** Credenciais do usuário administrador (papel Admin). */
export const ADMIN: Opcoes = { auth: { username: 'admin', password: 'admin' } }
/** Credenciais do usuário comum (papel Comum: só consulta cadastros). */
export const COMUM: Opcoes = { auth: { username: 'comum', password: 'comum' } }

/** Nome do serviço CDS por caminho OData (prefixo das actions de rascunho). */
const SERVICOS: Record<string, string> = {
  '/odata/v4/clientes': 'ClientesService',
  '/odata/v4/estoque': 'EstoqueService',
  '/odata/v4/pedidos': 'PedidosService',
  '/odata/v4/reembolsos': 'ReembolsosService'
}

/** Cliente HTTP mínimo usado nos testes (subconjunto do cds.test). */
interface ClienteHttp {
  get(url: string, opcoes?: Opcoes): Promise<Resposta>
  post(url: string, dados?: unknown, opcoes?: Opcoes): Promise<Resposta>
  patch(url: string, dados?: unknown, opcoes?: Opcoes): Promise<Resposta>
  put(url: string, dados?: unknown, opcoes?: Opcoes): Promise<Resposta>
  delete(url: string, opcoes?: Opcoes): Promise<Resposta>
}

/**
 * Sobe o servidor CAP do projeto (cds.test) apontando o ViaCEP para o
 * servidor falso. Devolve atalhos HTTP autenticados (ADMIN por padrão) e
 * do fluxo de rascunho (ativar, editar).
 */
export function iniciarServidor() {
  const teste = cds.test(join(import.meta.dirname, '..', '..')) as unknown as ClienteHttp
  const viacep = {} as ViaCepFalso
  before(async () => {
    Object.assign(viacep, await iniciarViaCepFalso())
    cds.env.requires.viacep.credentials.url = viacep.url
  })
  after(() => viacep.fechar?.())

  return {
    teste,
    viacep,
    get: (url: string, opcoes: Opcoes = ADMIN) => teste.get(url, opcoes),
    post: (url: string, dados: unknown = {}, opcoes: Opcoes = ADMIN) => teste.post(url, dados, opcoes),
    patch: (url: string, dados: unknown, opcoes: Opcoes = ADMIN) => teste.patch(url, dados, opcoes),
    put: (url: string, dados: unknown, opcoes: Opcoes = ADMIN) => teste.put(url, dados, opcoes),
    del: (url: string, opcoes: Opcoes = ADMIN) => teste.delete(url, opcoes),

    /** Chave OData de rascunho ou ativa. */
    chave: (ID: string, ativo = true) => `(ID=${ID},IsActiveEntity=${ativo})`,

    /** Ativa (Salvar) o rascunho e devolve a instância ativa. */
    async ativar(caminho: string, entidade: string, ID: string, opcoes: Opcoes = ADMIN) {
      const { data } = await teste.post(`${caminho}/${entidade}(ID=${ID},IsActiveEntity=false)/${SERVICOS[caminho]}.draftActivate`, {}, opcoes)
      return data
    },

    /** Cria um rascunho de edição a partir da instância ativa. */
    async editar(caminho: string, entidade: string, ID: string, opcoes: Opcoes = ADMIN) {
      const { data } = await teste.post(`${caminho}/${entidade}(ID=${ID},IsActiveEntity=true)/${SERVICOS[caminho]}.draftEdit`, { PreserveChanges: true }, opcoes)
      return data
    }
  }
}

/** Erro HTTP como lançado pelo cliente do cds.test. */
interface ErroHttp {
  status?: number
  code?: number
  message?: string
  response?: { status?: number, data?: { error?: CorpoErro } }
  data?: { error?: CorpoErro }
}
interface CorpoErro {
  code?: string
  message?: string
  details?: { code?: string, message?: string }[]
}

/**
 * Aguarda uma chamada que deve falhar e devolve o erro normalizado:
 * { status, message, details, codes }. Lança se a chamada tiver sucesso.
 */
export async function falha(promessa: Promise<unknown>): Promise<Falha> {
  try {
    await promessa
  } catch (erro) {
    const e = erro as ErroHttp
    const corpo: CorpoErro = e.response?.data?.error ?? e.data?.error ?? {}
    return {
      status: Number(e.response?.status ?? e.status ?? e.code),
      message: corpo.message ?? e.message ?? '',
      details: corpo.details ?? [],
      codes: [corpo.code, ...(corpo.details ?? []).map(d => d.code)].filter((c): c is string => Boolean(c))
    }
  }
  throw new Error('A chamada deveria ter falhado')
}
