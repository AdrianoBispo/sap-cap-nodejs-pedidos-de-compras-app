/**
 * Handlers do serviço Gestão de Clientes (porte de ZBP_R_PC_CLIENTE).
 *
 *  - Rascunho: cliente nasce ativo e com score sorteado; CPF, telefone e
 *    e-mail são normalizados; o CEP do endereço preenche o restante (ViaCEP)
 *    e o primeiro endereço vira principal.
 *  - Save: CPF (dígitos e unicidade), foto e endereços validados.
 *  - Exclusão bloqueada para cliente com pedido.
 */
import cds from '@sap/cds'
import { randomInt } from 'node:crypto'
import { preencherEnderecoPorCep, validarEnderecosDoCliente } from './lib/enderecos.js'
import { importarClientes } from './lib/importacao-clientes.js'
import { erro, rejeitar } from './lib/mensagens.js'
import { chave, ehRascunho, lerConteudo } from './lib/requisicao.js'
import { somenteDigitos, validarCpf, validarImagem } from './lib/util.js'

const { SELECT, UPDATE } = cds.ql

export default class ClientesService extends cds.ApplicationService {
  init() {
    const { Clientes, Enderecos } = this.entities
    const db = cds.entities('pedidoscompras')

    const valoresIniciais = req => {
      req.data.clienteAtivo ??= true
      req.data.scoreCliente ??= randomInt(0, 101)
    }
    this.before('NEW', Clientes.drafts, valoresIniciais)
    this.before('CREATE', Clientes, valoresIniciais)

    // CPF e telefone só com dígitos; e-mail em minúsculas
    const normalizar = req => {
      const d = req.data
      if (typeof d.cpf === 'string') d.cpf = somenteDigitos(d.cpf)
      if (typeof d.telefone === 'string') d.telefone = somenteDigitos(d.telefone)
      if (typeof d.email === 'string') d.email = d.email.trim().toLowerCase()
    }
    this.before('PATCH', Clientes.drafts, normalizar)
    // Score é sorteado pelo backend: nunca vem da UI
    this.before('PATCH', Clientes.drafts, req => { delete req.data.scoreCliente })
    this.before(['CREATE', 'UPDATE'], Clientes, normalizar)

    // Foto: JPEG, PNG ou WEBP (MIME, extensão e assinatura binária)
    const validarFoto = async req => {
      if (!('fotoCliente' in req.data) || req.data.fotoCliente == null) return
      const conteudo = await lerConteudo(req.data.fotoCliente)
      req.data.fotoCliente = conteudo
      const mime = req.data.fotoClienteMimeType ?? req.headers?.['content-type']
      if (!validarImagem(conteudo, mime, req.data.fotoClienteNome)) rejeitar(req, 400, 'FOTO_FORMATO_INVALIDO', {}, 'fotoCliente')
    }
    this.before(['PATCH', 'UPDATE'], Clientes.drafts, validarFoto)
    this.before(['CREATE', 'UPDATE'], Clientes, validarFoto)

    // Save: CPF válido e único + endereços
    this.before(['CREATE', 'UPDATE'], Clientes, async req => {
      const { cpf } = req.data
      if (cpf !== undefined && cpf !== null) {
        if (!validarCpf(cpf)) erro(req, 400, 'CLIENTE_CPF_INVALIDO', {}, 'cpf')
        else {
          const outro = await SELECT.one.from(db.Clientes).columns('ID').where({ cpf, ID: { '!=': chave(req) ?? '' } })
          if (outro) erro(req, 409, 'CLIENTE_CPF_DUPLICADO', {}, 'cpf')
        }
      }
      await validarEnderecosDoCliente(req, req.data.enderecos)
    })

    // Cliente com pedido (gravado ou em rascunho) não pode ser excluído
    this.before('DELETE', Clientes, async req => {
      const ID = chave(req)
      const pedidosRascunho = cds.model.definitions['PedidosService.Pedidos.drafts']
      const temPedido = (await SELECT.one.from(db.Pedidos).columns('ID').where({ cliente_ID: ID }))
        || (pedidosRascunho && (await SELECT.one.from(pedidosRascunho).columns('ID').where({ cliente_ID: ID })))
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
      for (const campo of ['principal', 'cidade', 'uf', 'estado', 'cepGeral', 'cepStatus']) delete req.data[campo]
      if ('cep' in req.data) await preencherEnderecoPorCep(req, req.data)
    })

    const definirPrincipal = async req => {
      const alvo = ehRascunho(req) ? Enderecos.drafts : db.Enderecos
      const ID = chave(req)
      const endereco = await SELECT.one.from(alvo, ID).columns('ID', 'cliente_ID')
      if (!endereco) return erro(req, 404, 'CAMPO_OBRIGATORIO', { campo: 'Endereço' })
      await UPDATE(alvo).with({ principal: false }).where({ cliente_ID: endereco.cliente_ID, ID: { '!=': ID } })
      await UPDATE(alvo).with({ principal: true }).where({ ID })
      return this.run(SELECT.one.from(ehRascunho(req) ? Enderecos.drafts : Enderecos).where({ ID }))
    }
    this.on('definirEnderecoPrincipal', Enderecos, definirPrincipal)
    this.on('definirEnderecoPrincipal', Enderecos.drafts, definirPrincipal)

    this.on('importarPlanilha', req => importarClientes(req, this))

    return super.init()
  }
}
