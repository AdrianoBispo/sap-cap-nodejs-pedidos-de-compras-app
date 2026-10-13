/**
 * Handlers do serviço Pedidos de Compras (PedidosService).
 *
 *  - Rascunho: status inicial, endereço principal do cliente, preço/total
 *    provisórios dos itens (com side effects na UI) e recusa imediata de
 *    item sem estoque.
 *  - Save: o primeiro Save registra o pedido (ABERTO), gera o número e
 *    reserva o estoque; o Save de uma edição ajusta a reserva pela diferença.
 *  - Ações: efetuarPagamento, aprovarPedido e cancelarPedido, somente sobre o
 *    pedido ativo e conforme o status.
 */
import cds, { type Request } from '@sap/cds'
import { Pedidos, ItensPedido, importarPlanilha, type ItemPedido, type Pedido } from '#cds-models/PedidosService'
import { Clientes as ClientesDb, Itens as ItensDb, ItensPedido as ItensPedidoDb, Pedidos as PedidosDb } from '#cds-models/pedidoscompras'
import {
  STATUS, STATUS_PAGAMENTO, MOEDA_PADRAO,
  enderecoPrincipal, reservaAtual, erroStatus, registrarPedido, atualizarPedidoAberto, removerCamposControlados,
  lerPedidoParaAcao, criarSnapshots, cancelarPedido, gravarPagamento
} from './lib/pedidos.js'
import { movimentarEstoque, MOVIMENTO } from './lib/estoque.js'
import { simularPagamento } from './lib/pagamento-simulado.js'
import { importarPedidos } from './lib/importacao-pedidos.js'
import { erro, aviso, info, rejeitar } from './lib/mensagens.js'
import { chave, ehRascunho } from './lib/requisicao.js'
import { arredondar } from './lib/util.js'

/** Parâmetros das ações vinculadas ao pedido (tipos gerados pelo cds-typer). */
type ParametrosPagamento = typeof Pedido.actions.efetuarPagamento.__parameters
type ParametrosCancelamento = typeof Pedido.actions.cancelarPedido.__parameters

/** Estado da linha gravado no rascunho (na criação, só o pedido). */
type LinhaRascunho = Pick<ItemPedido, 'pedido_ID' | 'item_ID' | 'qtdeItemPedido'>

/** Requisição de linha de rascunho excluída/descartada, com o pedido guardado no before. */
type RequisicaoLinha = Request & { pedidoDaLinha?: string | null }

export default class PedidosService extends cds.ApplicationService {
  /** Registra os handlers de rascunho, Save, ações do ciclo de vida e importação. */
  override init() {

    // ------------------------------------------------------------------
    // Rascunho
    // ------------------------------------------------------------------

    this.before('NEW', Pedidos.drafts, req => {
      Object.assign(req.data, {
        statusPedido_code: STATUS.aberto,
        statusPagamento_code: STATUS_PAGAMENTO.pendente,
        currency_code: MOEDA_PADRAO,
        valorTotal: 0
      })
    })

    // Troca de cliente: usa o endereço principal atual (side effect na UI).
    // Status, número, totais e endereço são mantidos só pelo backend.
    this.before('PATCH', Pedidos.drafts, async req => {
      removerCamposControlados(req.data)
      if (!('cliente_ID' in req.data)) return
      const rascunho = await SELECT.one.from(Pedidos.drafts).columns('numeroPedido').where({ ID: chave(req) })
      if (rascunho?.numeroPedido) return rejeitar(req, 409, 'PEDIDO_CLIENTE_IMUTAVEL', {}, 'cliente_ID')
      const endereco = await enderecoPrincipal(req.data.cliente_ID)
      req.data.endereco_ID = endereco?.ID ?? null
      req.data.enderecoPrincipalCompleto = endereco?.completo ?? null
      // O rascunho guarda o CPF lido da associação: acompanha o cliente escolhido
      const cliente = req.data.cliente_ID ? await SELECT.one.from(ClientesDb, req.data.cliente_ID).columns('cpf', 'cpfFormatado') : null
      req.data.cpfCliente = cliente?.cpf ?? null
      req.data.cpfClienteFormatado = cliente?.cpfFormatado ?? null
      if (req.data.cliente_ID && !endereco) aviso(req, 'CLIENTE_SEM_ENDERECO_PRINCIPAL', {}, 'cliente_ID')
    })

    /**
     * Preço provisório, total e SKU da linha do rascunho; item sem estoque é
     * recusado na hora (exceto se já estiver reservado pelo pedido). Item que
     * já está no pedido gravado mantém o preço fixado.
     * @param req NEW ou PATCH da linha
     * @param linha estado
     *   gravado no rascunho (na criação, só o pedido)
     */
    const calcularLinha = async (req: Request<ItemPedido>, linha: LinhaRascunho | undefined) => {
      const itemID = 'item_ID' in req.data ? req.data.item_ID : linha?.item_ID
      const qtde = Number('qtdeItemPedido' in req.data ? req.data.qtdeItemPedido : linha?.qtdeItemPedido) || 0
      let preco = 0
      let item
      if (itemID) {
        item = await SELECT.one.from(ItensDb, itemID).columns('sku', 'precoUnitario', 'currency_code', 'qtdeDisponivel')
        const jaNoPedido = linha?.pedido_ID ? (await reservaAtual(linha.pedido_ID)).has(itemID) : false
        if ('item_ID' in req.data && item && (item.qtdeDisponivel ?? 0) <= 0 && !jaNoPedido) {
          return rejeitar(req, 409, 'ITEM_SEM_ESTOQUE', { sku: item.sku }, 'item_ID')
        }
        const fixado = linha?.pedido_ID
          ? await SELECT.one.from(ItensPedidoDb).columns('precoUnitarioSnapshot').where({ pedido_ID: linha.pedido_ID, item_ID: itemID })
          : null
        preco = Number(fixado?.precoUnitarioSnapshot ?? item?.precoUnitario ?? 0)
        req.data.currency_code = item?.currency_code ?? MOEDA_PADRAO
      }
      // O rascunho guarda o SKU lido da associação: acompanha o item escolhido
      if ('item_ID' in req.data) req.data.skuItem = item?.sku ?? null
      req.data.precoUnitarioSnapshot = preco
      req.data.valorTotal = arredondar(qtde * preco)
    }

    // A linha pode nascer já com o item (criação inline na tabela de itens)
    this.before('NEW', ItensPedido.drafts, req => {
      req.data.currency_code ??= MOEDA_PADRAO
      req.data.qtdeItemPedido ??= 1
      return calcularLinha(req, { pedido_ID: req.data.pedido_ID })
    })

    this.before('PATCH', ItensPedido.drafts, async req => {
      if (!('item_ID' in req.data) && !('qtdeItemPedido' in req.data)) return
      const linha = await SELECT.one.from(ItensPedido.drafts).columns('pedido_ID', 'item_ID', 'qtdeItemPedido').where({ ID: chave(req) })
      return calcularLinha(req, linha ?? undefined)
    })

    /** Recalcula o total do pedido no rascunho (soma das linhas). */
    const recalcularTotalRascunho = async (pedidoID: string | null | undefined) => {
      if (!pedidoID) return
      const linhas = await SELECT.from(ItensPedido.drafts).columns('valorTotal').where({ pedido_ID: pedidoID })
      const total = arredondar(linhas.reduce((soma, l) => soma + Number(l.valorTotal ?? 0), 0))
      await UPDATE(Pedidos.drafts).with({ valorTotal: total }).where({ ID: pedidoID })
    }
    this.after(['NEW', 'PATCH'], ItensPedido.drafts, async (_, req) => {
      const linha = await SELECT.one.from(ItensPedido.drafts).columns('pedido_ID').where({ ID: chave(req) })
      await recalcularTotalRascunho(linha?.pedido_ID ?? req.data.pedido_ID)
    })
    this.before(['DISCARD', 'DELETE'], ItensPedido.drafts, async (req: RequisicaoLinha) => {
      const linha = await SELECT.one.from(ItensPedido.drafts).columns('pedido_ID').where({ ID: chave(req) })
      req.pedidoDaLinha = linha?.pedido_ID
    })
    this.after(['DISCARD', 'DELETE'], ItensPedido.drafts, (_, req: RequisicaoLinha) => recalcularTotalRascunho(req.pedidoDaLinha))

    // ------------------------------------------------------------------
    // Save (ativação do rascunho) e manutenção do pedido ativo
    // ------------------------------------------------------------------

    this.before('CREATE', Pedidos, req => registrarPedido(req))
    this.before('UPDATE', Pedidos, req => atualizarPedidoAberto(req, chave(req)!))

    this.before('EDIT', Pedidos, async req => {
      const pedido = await SELECT.one.from(PedidosDb, chave(req)!).columns('statusPedido_code')
      if (pedido?.statusPedido_code !== STATUS.aberto) erro(req, 409, 'PEDIDO_EDICAO_BLOQUEADA')
    })

    // O pedido registrado não é excluído, apenas cancelado
    this.before('DELETE', Pedidos, req => { erro(req, 409, 'PEDIDO_EXCLUSAO_BLOQUEADA') })

    // ------------------------------------------------------------------
    // Ações do ciclo de vida (somente sobre o pedido ativo)
    // ------------------------------------------------------------------

    /**
     * Pedido alvo de uma ação do ciclo de vida: as ações só valem para o
     * pedido ativo, sem rascunho de edição aberto.
     * @returns o pedido, ou null com o erro registrado
     */
    const pedidoAtivo = async (req: Request) => {
      if (ehRascunho(req)) {
        erro(req, 409, 'ACAO_SOMENTE_ATIVO')
        return null
      }
      return lerPedidoParaAcao(req, chave(req)!)
    }

    /** Relê o pedido pela projeção do serviço (resposta das actions). */
    const resultado = (ID: string) => this.run(SELECT.one.from(Pedidos).where({ ID }))

    /**
     * Action efetuarPagamento: pedido ABERTO, dados do cartão só em memória.
     * Aprovado, o pedido vai para AGUARDANDO_APROVACAO; recusado, segue ABERTO
     * para nova tentativa.
     * @param req parâmetros do cartão
     */
    const pagar = async (req: Request<ParametrosPagamento>) => {
      const pedido = await pedidoAtivo(req)
      if (!pedido?.ID) return
      if (pedido.statusPedido_code !== STATUS.aberto) return erroStatus(req, pedido)

      // Dados do cartão: somente em memória, nunca persistidos ou registrados
      const { metodoPagamento, numeroCartao, validade, cvv } = req.data
      const simulacao = simularPagamento({ metodo: metodoPagamento, numero: numeroCartao, validade, cvv })
      if (!simulacao.dadosValidos) return erro(req, 400, 'CARTAO_DADOS_INVALIDOS', { erro: simulacao.erro })

      await gravarPagamento(pedido.ID, simulacao)
      const aprovado = simulacao.status === STATUS_PAGAMENTO.aprovado
      await UPDATE(PedidosDb, pedido.ID).with({
        statusPagamento_code: simulacao.status,
        statusPedido_code: aprovado ? STATUS.aguardandoAprovacao : STATUS.aberto
      })
      if (aprovado) info(req, 'PAGAMENTO_APROVADO')
      else aviso(req, 'PAGAMENTO_RECUSADO')
      return resultado(pedido.ID)
    }

    /**
     * Action aprovarPedido: pedido AGUARDANDO_APROVACAO com pagamento aprovado.
     * Baixa o estoque reservado, gera os snapshots e finaliza o pedido.
     */
    const aprovar = async (req: Request) => {
      const pedido = await pedidoAtivo(req)
      if (!pedido?.ID) return
      if (pedido.statusPedido_code === STATUS.aberto) return erro(req, 409, 'PEDIDO_PAGAMENTO_PENDENTE')
      if (pedido.statusPedido_code !== STATUS.aguardandoAprovacao) return erroStatus(req, pedido)
      if (pedido.statusPagamento_code !== STATUS_PAGAMENTO.aprovado) return erro(req, 409, 'PEDIDO_PAGAMENTO_PENDENTE')

      // Baixa QtdeEstoque e QtdeReservada (a condição no banco confere a reserva)
      if (!(await movimentarEstoque(req, MOVIMENTO.baixar, await reservaAtual(pedido.ID)))) return
      await criarSnapshots(req, pedido, 'FINALIZACAO')
      await UPDATE(PedidosDb, pedido.ID).with({
        statusPedido_code: STATUS.finalizado,
        dataFinalizacao: new Date().toISOString()
      })
      info(req, 'PEDIDO_FINALIZADO', { numero: pedido.numeroPedido })
      return resultado(pedido.ID)
    }

    /**
     * Action cancelarPedido: cancela o pedido ou, com pagamento aprovado, abre a
     * solicitação de reembolso (ver cancelarPedido em srv/lib/pedidos).
     * @param req motivo do cancelamento
     */
    const cancelar = async (req: Request<ParametrosCancelamento>) => {
      const pedido = await pedidoAtivo(req)
      if (!pedido?.ID) return
      await cancelarPedido(req, pedido, req.data.motivoCancelamento)
      if (req.errors) return
      return resultado(pedido.ID)
    }

    // As actions vinculadas também existem no rascunho (Pedidos.drafts), mas no
    // lean draft o handler de Pedidos não vale para o rascunho: sem registrar
    // os dois, a chamada no rascunho termina em 501 "has no handler" em vez
    // da mensagem ACAO_SOMENTE_ATIVO.
    this.on('efetuarPagamento', Pedidos, pagar)
    this.on('efetuarPagamento', Pedidos.drafts, pagar)
    this.on('aprovarPedido', Pedidos, aprovar)
    this.on('aprovarPedido', Pedidos.drafts, aprovar)
    this.on('cancelarPedido', Pedidos, cancelar)
    this.on('cancelarPedido', Pedidos.drafts, cancelar)

    this.on(importarPlanilha, req => importarPedidos(req, this))

    return super.init()
  }
}
