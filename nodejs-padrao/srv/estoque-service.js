/**
 * Handlers do serviço Gestão de Estoque (porte de ZBP_R_PC_ITEM).
 *
 *  - SKU gerado no Save com as 3 primeiras letras da categoria; regenerado se
 *    a categoria mudar.
 *  - QtdeReservada nunca vem da UI (só o domínio de pedidos a altera);
 *    QtdeDisponivel e StatusEstoque são colunas calculadas pelo banco.
 *  - Inativação e exclusão bloqueadas quando há estoque, reserva ou pedido.
 */
import cds from '@sap/cds'
import { gerarSku } from './lib/numeracao.js'
import { importarItens } from './lib/importacao-estoque.js'
import { erro } from './lib/mensagens.js'
import { chave, lerConteudo } from './lib/requisicao.js'
import { prefixoCategoria, validarImagem } from './lib/util.js'

const { SELECT } = cds.ql

const STATUS_PEDIDO_ATIVO = ['ABERTO', 'AGUARDANDO_APROVACAO', 'PROCESSANDO_REEMBOLSO']

export default class EstoqueService extends cds.ApplicationService {
  init() {
    const { Itens } = this.entities
    const db = cds.entities('pedidoscompras')

    this.before('NEW', Itens.drafts, req => {
      req.data.itemAtivo ??= true
      req.data.currency_code ??= 'BRL'
      req.data.qtdeEstoque ??= 0
      req.data.qtdeReservada = 0
    })

    // Item com pedido ativo ou em rascunho (bloqueia inativação/exclusão)
    const emPedido = async (ID, somenteAtivos) => {
      const linhas = await SELECT.from(db.ItensPedido).columns('pedido.statusPedido_code as status').where({ item_ID: ID })
      if (linhas.some(l => !somenteAtivos || STATUS_PEDIDO_ATIVO.includes(l.status))) return true
      const rascunhos = cds.model.definitions['PedidosService.ItensPedido.drafts']
      return Boolean(rascunhos && (await SELECT.one.from(rascunhos).columns('ID').where({ item_ID: ID })))
    }

    this.before(['CREATE', 'UPDATE'], Itens, async req => {
      const d = req.data
      const ID = chave(req)
      // A reserva só é movimentada pelos pedidos: nunca aceita valor da UI
      delete d.qtdeReservada
      const atual = req.event === 'UPDATE'
        ? await SELECT.one.from(db.Itens, ID).columns('sku', 'categoria_code', 'qtdeEstoque', 'qtdeReservada', 'itemAtivo')
        : null

      // SKU: gerado no Save; regenerado se a categoria (prefixo) mudou
      const categoria = d.categoria_code ?? atual?.categoria_code
      if (!atual) d.sku = categoria ? await gerarSku(categoria) : null
      else if (categoria && atual.sku?.slice(4, 7) !== prefixoCategoria(categoria)) d.sku = await gerarSku(categoria)
      else delete d.sku

      // Inativação: sem estoque disponível e sem pedido ativo vinculado
      if (atual?.itemAtivo && d.itemAtivo === false) {
        const disponivel = (d.qtdeEstoque ?? atual.qtdeEstoque) - atual.qtdeReservada
        if (disponivel > 0 || (await emPedido(ID, true))) erro(req, 409, 'ITEM_INATIVACAO_BLOQUEADA', {}, 'itemAtivo')
      }
    })

    // Foto: JPEG, PNG ou WEBP
    const validarFoto = async req => {
      if (!('fotoItem' in req.data) || req.data.fotoItem == null) return
      const conteudo = await lerConteudo(req.data.fotoItem)
      req.data.fotoItem = conteudo
      const mime = req.data.fotoItemMimeType ?? req.headers?.['content-type']
      if (!validarImagem(conteudo, mime, req.data.fotoItemNome)) erro(req, 400, 'FOTO_FORMATO_INVALIDO', {}, 'fotoItem')
    }
    this.before(['PATCH', 'UPDATE'], Itens.drafts, validarFoto)
    this.before(['CREATE', 'UPDATE'], Itens, validarFoto)

    // Exclusão: sem reserva e sem vínculo com pedidos
    this.before('DELETE', Itens, async req => {
      const ID = chave(req)
      const item = await SELECT.one.from(db.Itens, ID).columns('qtdeReservada')
      if (item?.qtdeReservada > 0 || (await emPedido(ID, false))) erro(req, 409, 'ITEM_EXCLUSAO_BLOQUEADA')
    })

    this.on('importarPlanilha', req => importarItens(req, this))

    return super.init()
  }
}
