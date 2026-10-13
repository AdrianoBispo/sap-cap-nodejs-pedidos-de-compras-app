/**
 * Handlers do serviço Gestão de Reembolsos (ReembolsosService).
 * A decisão executa, na mesma transação, o lado do pedido: cancelar com
 * liberação de reserva, snapshots e devolução do pagamento (aprovar) ou
 * retomar o status anterior (rejeitar).
 */
import cds from '@sap/cds'
import { cancelarPorReembolso, retomarPedido } from './lib/pedidos.js'
import { erro, info } from './lib/mensagens.js'
import { chave } from './lib/requisicao.js'

const { SELECT, UPDATE } = cds.ql

export default class ReembolsosService extends cds.ApplicationService {
  /** Registra as actions de decisão do reembolso. */
  init() {
    const { Reembolsos } = this.entities
    const db = cds.entities('pedidoscompras')

    /**
     * Lê a solicitação endereçada e confere que está PENDENTE.
     * @param {import('@sap/cds').Request} req
     * @returns a solicitação, ou null com o erro registrado
     */
    const solicitacaoPendente = async req => {
      const reembolso = await SELECT.one.from(db.Reembolsos, chave(req))
      if (!reembolso || reembolso.statusReembolso_code !== 'PENDENTE') {
        erro(req, 409, 'REEMBOLSO_STATUS_INVALIDO')
        return null
      }
      return reembolso
    }

    /**
     * Grava a decisão na solicitação: status, motivo, data e usuário.
     * @param {string} ID solicitação
     * @param {'APROVADO'|'REJEITADO'} status
     * @param {string|undefined} motivo motivo da decisão (opcional na aprovação)
     * @param {import('@sap/cds').Request} req
     */
    const registrarDecisao = (ID, status, motivo, req) => UPDATE(db.Reembolsos, ID).with({
      statusReembolso_code: status,
      motivoDecisao: motivo || null,
      dataDecisao: new Date().toISOString(),
      decididoPor: req.user.id
    })

    this.on('aprovarReembolso', Reembolsos, async req => {
      const reembolso = await solicitacaoPendente(req)
      if (!reembolso) return
      await cancelarPorReembolso(req, reembolso.pedido_ID)
      if (req.errors) return
      await registrarDecisao(reembolso.ID, 'APROVADO', req.data.motivoDecisao?.trim(), req)
      info(req, 'REEMBOLSO_APROVADO', { numero: reembolso.numeroPedido })
      return this.run(SELECT.one.from(Reembolsos).where({ ID: reembolso.ID }))
    })

    this.on('rejeitarReembolso', Reembolsos, async req => {
      const reembolso = await solicitacaoPendente(req)
      if (!reembolso) return
      const motivo = req.data.motivoDecisao?.trim()
      if (!motivo) return erro(req, 400, 'REEMBOLSO_MOTIVO_DECISAO_OBRIG', {}, 'motivoDecisao')
      await retomarPedido(req, reembolso.pedido_ID, reembolso.statusPedidoAnterior_code)
      if (req.errors) return
      await registrarDecisao(reembolso.ID, 'REJEITADO', motivo, req)
      info(req, 'REEMBOLSO_REJEITADO', { numero: reembolso.numeroPedido })
      return this.run(SELECT.one.from(Reembolsos).where({ ID: reembolso.ID }))
    })

    return super.init()
  }
}
