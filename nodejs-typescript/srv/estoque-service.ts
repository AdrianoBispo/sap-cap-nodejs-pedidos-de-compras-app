/**
 * Handlers do serviço Gestão de Estoque (EstoqueService).
 *
 *  - SKU gerado no Save com as 3 primeiras letras da categoria; regenerado se
 *    a categoria mudar.
 *  - QtdeReservada nunca vem da UI (só o domínio de pedidos a altera);
 *    QtdeDisponivel e StatusEstoque são colunas calculadas pelo banco.
 *  - Inativação e exclusão bloqueadas quando há estoque, reserva ou pedido.
 */
import cds, { type Request } from '@sap/cds'
import { Itens, importarPlanilha, type Item } from '#cds-models/EstoqueService'
import { Itens as ItensDb, ItensPedido as ItensPedidoDb, type StatusPedido_code } from '#cds-models/pedidoscompras'
import { ItensPedido as ItensPedidoServico } from '#cds-models/PedidosService'
import { gerarSku } from './lib/numeracao.js'
import { importarItens } from './lib/importacao-estoque.js'
import { erro, rejeitar } from './lib/mensagens.js'
import { chave, lerConteudo } from './lib/requisicao.js'
import { prefixoCategoria, validarImagem } from './lib/util.js'

/** Status em que o pedido ainda está em andamento (prende o item). */
const STATUS_PEDIDO_ATIVO: readonly StatusPedido_code[] = ['ABERTO', 'AGUARDANDO_APROVACAO', 'PROCESSANDO_REEMBOLSO']

export default class EstoqueService extends cds.ApplicationService {
  /** Registra os handlers de itens e importação. */
  override init() {

    this.before('NEW', Itens.drafts, req => {
      req.data.itemAtivo ??= true
      req.data.currency_code ??= 'BRL'
      req.data.qtdeEstoque ??= 0
      req.data.qtdeReservada = 0
    })

    /**
     * Indica se o item está em algum pedido gravado ou em rascunho de pedido.
     * @param ID item
     * @param somenteAtivos true: só pedidos em andamento contam
     *   (inativação); false: qualquer pedido (exclusão)
     */
    const emPedido = async (ID: string | undefined, somenteAtivos: boolean): Promise<boolean> => {
      // Coluna por caminho com alias: o resultado não tem o formato da entidade
      const linhas = await SELECT.from(ItensPedidoDb)
        .columns('pedido.statusPedido_code as status').where({ item_ID: ID }) as unknown as { status: StatusPedido_code }[]
      if (linhas.some(l => !somenteAtivos || STATUS_PEDIDO_ATIVO.includes(l.status))) return true
      return Boolean(await SELECT.one.from(ItensPedidoServico.drafts).columns('ID').where({ item_ID: ID }))
    }

    this.before(['CREATE', 'UPDATE'], Itens, async req => {
      const d = req.data
      const ID = chave(req)
      // A reserva só é movimentada pelos pedidos: nunca aceita valor da UI
      delete d.qtdeReservada
      const atual = req.event === 'UPDATE' && ID
        ? await SELECT.one.from(ItensDb, ID).columns('sku', 'categoria_code', 'qtdeEstoque', 'qtdeReservada', 'itemAtivo')
        : null

      // SKU: gerado no Save; regenerado se a categoria (prefixo) mudou
      const categoria = d.categoria_code ?? atual?.categoria_code
      if (!atual) d.sku = categoria ? await gerarSku(categoria) : null
      else if (categoria && atual.sku?.slice(4, 7) !== prefixoCategoria(categoria)) d.sku = await gerarSku(categoria)
      else delete d.sku

      // Inativação: sem estoque disponível e sem pedido ativo vinculado
      if (atual?.itemAtivo && d.itemAtivo === false) {
        const disponivel = (d.qtdeEstoque ?? atual.qtdeEstoque ?? 0) - (atual.qtdeReservada ?? 0)
        if (disponivel > 0 || (await emPedido(ID, true))) erro(req, 409, 'ITEM_INATIVACAO_BLOQUEADA', {}, 'itemAtivo')
      }
    })

    /**
     * Lê a foto enviada e aceita só JPEG, PNG ou WEBP (MIME, extensão e
     * assinatura binária); outro formato rejeita o upload.
     * @param req upload no rascunho ou Save
     */
    const validarFoto = async (req: Request<Item>) => {
      const dados = req.data as Omit<Item, 'fotoItem'> & { fotoItem?: unknown }
      if (!('fotoItem' in dados) || dados.fotoItem == null) return
      const conteudo = await lerConteudo(dados.fotoItem)
      dados.fotoItem = conteudo
      const mime = dados.fotoItemMimeType ?? req.headers?.['content-type']
      if (!validarImagem(conteudo, mime, dados.fotoItemNome)) rejeitar(req, 400, 'FOTO_FORMATO_INVALIDO', {}, 'fotoItem')
    }
    this.before(['PATCH', 'UPDATE'], Itens.drafts, validarFoto)
    this.before(['CREATE', 'UPDATE'], Itens, validarFoto)

    // Exclusão: sem reserva e sem vínculo com pedidos
    this.before('DELETE', Itens, async req => {
      const ID = chave(req)
      const item = ID ? await SELECT.one.from(ItensDb, ID).columns('qtdeReservada') : null
      if ((item?.qtdeReservada ?? 0) > 0 || (await emPedido(ID, false))) erro(req, 409, 'ITEM_EXCLUSAO_BLOQUEADA')
    })

    this.on(importarPlanilha, req => importarItens(req, this))

    return super.init()
  }
}
