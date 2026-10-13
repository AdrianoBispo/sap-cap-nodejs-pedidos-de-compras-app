/**
 * Handlers do serviço Gestão de Clientes (ClientesService).
 *
 *  - Rascunho: cliente nasce ativo e com score sorteado; CPF, telefone e
 *    e-mail são normalizados; o CEP do endereço preenche o restante (ViaCEP)
 *    e o primeiro endereço vira principal.
 *  - Save: CPF (dígitos e unicidade), foto e endereços validados.
 *  - Exclusão bloqueada para cliente com pedido.
 */
import cds, { type Request } from '@sap/cds'
import { randomInt } from 'node:crypto'
import { Clientes, Enderecos, Permissoes, importarPlanilha, type Cliente } from '#cds-models/ClientesService'
import { Clientes as ClientesDb, Enderecos as EnderecosDb, Pedidos as PedidosDb } from '#cds-models/pedidoscompras'
import { Pedidos as PedidosServico } from '#cds-models/PedidosService'
import { preencherEnderecoPorCep, validarEnderecosDoCliente } from './lib/enderecos.js'
import { importarClientes } from './lib/importacao-clientes.js'
import { erro, rejeitar } from './lib/mensagens.js'
import { permissoesDoUsuario } from './lib/permissoes.js'
import { chave, ehRascunho, lerConteudo } from './lib/requisicao.js'
import { somenteDigitos, validarCpf, validarImagem } from './lib/util.js'

export default class ClientesService extends cds.ApplicationService {
  /** Registra os handlers de clientes, endereços e importação. */
  override init() {

    /**
     * Valores iniciais do cliente: ativo e com score sorteado de 0 a 100.
     * @param req NEW do rascunho ou CREATE direto
     */
    const valoresIniciais = (req: Request<Cliente>) => {
      req.data.clienteAtivo ??= true
      req.data.scoreCliente ??= randomInt(0, 101)
    }
    this.before('NEW', Clientes.drafts, valoresIniciais)
    this.before('CREATE', Clientes, valoresIniciais)

    /**
     * Normaliza os dados digitados: CPF e telefone só com dígitos e e-mail em
     * minúsculas, antes das validações declarativas.
     */
    const normalizar = (req: Request<Cliente>) => {
      const d = req.data
      if (typeof d.cpf === 'string') d.cpf = somenteDigitos(d.cpf)
      if (typeof d.telefone === 'string') d.telefone = somenteDigitos(d.telefone)
      if (typeof d.email === 'string') d.email = d.email.trim().toLowerCase()
    }
    this.before('PATCH', Clientes.drafts, normalizar)
    // Score é sorteado pelo backend: nunca vem da UI
    this.before('PATCH', Clientes.drafts, req => { delete req.data.scoreCliente })
    this.before(['CREATE', 'UPDATE'], Clientes, normalizar)

    /**
     * Lê a foto enviada e aceita só JPEG, PNG ou WEBP (MIME, extensão e
     * assinatura binária); outro formato rejeita o upload.
     * @param req upload no rascunho ou Save
     */
    const validarFoto = async (req: Request<Cliente>) => {
      const dados = req.data as Omit<Cliente, 'fotoCliente'> & { fotoCliente?: unknown }
      if (!('fotoCliente' in dados) || dados.fotoCliente == null) return
      const conteudo = await lerConteudo(dados.fotoCliente)
      dados.fotoCliente = conteudo
      const mime = dados.fotoClienteMimeType ?? req.headers?.['content-type']
      if (!validarImagem(conteudo, mime, dados.fotoClienteNome)) rejeitar(req, 400, 'FOTO_FORMATO_INVALIDO', {}, 'fotoCliente')
    }
    this.before(['PATCH', 'UPDATE'], Clientes.drafts, validarFoto)
    this.before(['CREATE', 'UPDATE'], Clientes, validarFoto)

    // Save: CPF válido e único + endereços
    this.before(['CREATE', 'UPDATE'], Clientes, async req => {
      const { cpf } = req.data
      if (cpf !== undefined && cpf !== null) {
        if (!validarCpf(cpf)) erro(req, 400, 'CLIENTE_CPF_INVALIDO', {}, 'cpf')
        else {
          const outro = await SELECT.one.from(ClientesDb).columns('ID').where({ cpf, ID: { '!=': chave(req) ?? '' } })
          if (outro) erro(req, 409, 'CLIENTE_CPF_DUPLICADO', {}, 'cpf')
        }
      }
      await validarEnderecosDoCliente(req, req.data.enderecos)
    })

    // Cliente com pedido (gravado ou em rascunho) não pode ser excluído
    this.before('DELETE', Clientes, async req => {
      const ID = chave(req)
      const temPedido = (await SELECT.one.from(PedidosDb).columns('ID').where({ cliente_ID: ID }))
        || (await SELECT.one.from(PedidosServico.drafts).columns('ID').where({ cliente_ID: ID }))
      if (temPedido) erro(req, 409, 'CLIENTE_COM_PEDIDO')
    })

    // ------------------------------------------------------------------
    // Endereços
    // ------------------------------------------------------------------

    // Se o cliente ainda não tem endereço principal, o primeiro novo vira principal
    this.before('NEW', Enderecos.drafts, async req => {
      const principal = await SELECT.one.from(Enderecos.drafts).columns('ID')
        .where({ cliente_ID: req.data.cliente_ID, principal: true })
      req.data.principal = !principal
    })

    // CEP informado: preenche o endereço (side effects recarregam os campos)
    this.before('PATCH', Enderecos.drafts, async req => {
      // Principal só muda pela ação; cidade/UF/estado e status do CEP só pelo ViaCEP
      for (const campo of ['principal', 'cidade', 'uf', 'estado', 'cepGeral', 'cepStatus'] as const) delete req.data[campo]
      if ('cep' in req.data) await preencherEnderecoPorCep(req, req.data)
    })

    /**
     * Action definirEnderecoPrincipal: marca o endereço como principal e
     * desmarca os demais do mesmo cliente, no rascunho ou na instância ativa.
     * @returns o endereço atualizado, lido pelo serviço
     */
    const definirPrincipal = async (req: Request) => {
      const rascunho = ehRascunho(req)
      const alvo = rascunho ? Enderecos.drafts : EnderecosDb
      const ID = chave(req)
      const endereco = await SELECT.one.from(alvo).columns('ID', 'cliente_ID').where({ ID })
      if (!endereco) return erro(req, 404, 'CAMPO_OBRIGATORIO', { campo: 'Endereço' })
      await UPDATE(alvo).with({ principal: false }).where({ cliente_ID: endereco.cliente_ID, ID: { '!=': ID } })
      await UPDATE(alvo).with({ principal: true }).where({ ID })
      return this.run(SELECT.one.from(rascunho ? Enderecos.drafts : Enderecos).where({ ID }))
    }
    this.on('definirEnderecoPrincipal', Enderecos, definirPrincipal)
    this.on('definirEnderecoPrincipal', Enderecos.drafts, definirPrincipal)

    // Singleton lido pela UI para esconder o que o usuário não pode alterar
    this.on('READ', Permissoes, req => permissoesDoUsuario(req))

    this.on(importarPlanilha, req => importarClientes(req, this))

    return super.init()
  }
}
