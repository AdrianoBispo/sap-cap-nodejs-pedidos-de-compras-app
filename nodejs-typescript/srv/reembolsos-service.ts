/**
 * Handlers do serviço Gestão de Reembolsos (porte de ZBP_R_PC_REEMBOLSO).
 * A decisão executa, na mesma transação, o lado do pedido: cancelar com
 * liberação de reserva, snapshots e devolução do pagamento (aprovar) ou
 * retomar o status anterior (rejeitar).
 */
import cds, { type Request } from '@sap/cds'
import { Reembolsos, type Reembolso } from '#cds-models/ReembolsosService'
import { Reembolsos as ReembolsosDb, type StatusReembolso_code } from '#cds-models/pedidoscompras'
import { cancelarPorReembolso, retomarPedido } from './lib/pedidos.js'
import { erro, info } from './lib/mensagens.js'
import { chave } from './lib/requisicao.js'

/** Parâmetro das ações de decisão (tipos gerados pelo cds-typer). */
type ParametrosDecisao = typeof Reembolso.actions.rejeitarReembolso.__parameters

export default class ReembolsosService extends cds.ApplicationService {
  override init() {

    const solicitacaoPendente = async (req: Request) => {
      const reembolso = await SELECT.one.from(ReembolsosDb, chave(req)!)
      if (!reembolso?.ID || !reembolso.pedido_ID || reembolso.statusReembolso_code !== 'PENDENTE') {
        erro(req, 409, 'REEMBOLSO_STATUS_INVALIDO')
        return null
      }
      return { ...reembolso, ID: reembolso.ID, pedido_ID: reembolso.pedido_ID }
    }

    const registrarDecisao = (ID: string, status: StatusReembolso_code, motivo: string | undefined, req: Request) =>
      UPDATE(ReembolsosDb, ID).with({
        statusReembolso_code: status,
        motivoDecisao: motivo || null,
        dataDecisao: new Date().toISOString(),
        decididoPor: req.user.id
      })

    const resultado = (ID: string) => this.run(SELECT.one.from(Reembolsos).where({ ID }))

    this.on('aprovarReembolso', Reembolsos, async (req: Request<ParametrosDecisao>) => {
      const reembolso = await solicitacaoPendente(req)
      if (!reembolso) return
      await cancelarPorReembolso(req, reembolso.pedido_ID)
      if (req.errors) return
      await registrarDecisao(reembolso.ID, 'APROVADO', req.data.motivoDecisao?.trim(), req)
      info(req, 'REEMBOLSO_APROVADO', { numero: reembolso.numeroPedido })
      return resultado(reembolso.ID)
    })

    this.on('rejeitarReembolso', Reembolsos, async (req: Request<ParametrosDecisao>) => {
      const reembolso = await solicitacaoPendente(req)
      if (!reembolso) return
      const motivo = req.data.motivoDecisao?.trim()
      if (!motivo) return erro(req, 400, 'REEMBOLSO_MOTIVO_DECISAO_OBRIG', {}, 'motivoDecisao')
      await retomarPedido(req, reembolso.pedido_ID, reembolso.statusPedidoAnterior_code)
      if (req.errors) return
      await registrarDecisao(reembolso.ID, 'REJEITADO', motivo, req)
      info(req, 'REEMBOLSO_REJEITADO', { numero: reembolso.numeroPedido })
      return resultado(reembolso.ID)
    })

    return super.init()
  }
}
