/**
 * Handlers do serviço Gestão de Reembolsos (ReembolsosService).
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
  /** Registra as actions de decisão do reembolso. */
  override init() {

    /**
     * Lê a solicitação endereçada e confere que está PENDENTE.
     * @returns a solicitação, ou null com o erro registrado
     */
    const solicitacaoPendente = async (req: Request) => {
      const reembolso = await SELECT.one.from(ReembolsosDb, chave(req)!)
      if (!reembolso?.ID || !reembolso.pedido_ID || reembolso.statusReembolso_code !== 'PENDENTE') {
        erro(req, 409, 'REEMBOLSO_STATUS_INVALIDO')
        return null
      }
      return { ...reembolso, ID: reembolso.ID, pedido_ID: reembolso.pedido_ID }
    }

    /**
     * Grava a decisão na solicitação ainda PENDENTE (UPDATE condicional, feito
     * antes do lado do pedido): de duas decisões simultâneas só a primeira vale
     * e a outra recebe REEMBOLSO_STATUS_INVALIDO.
     * @returns false se a solicitação já não estava pendente
     */
    const registrarDecisao = async (req: Request, ID: string, status: StatusReembolso_code, motivo: string | undefined): Promise<boolean> => {
      const alterados: number = await UPDATE(ReembolsosDb).with({
        statusReembolso_code: status,
        motivoDecisao: motivo || null,
        dataDecisao: new Date().toISOString(),
        decididoPor: req.user.id
      }).where({ ID, statusReembolso_code: 'PENDENTE' })
      if (alterados === 1) return true
      erro(req, 409, 'REEMBOLSO_STATUS_INVALIDO')
      return false
    }

    /** Relê a solicitação pela projeção do serviço (resposta da action). */
    const resultado = (ID: string) => this.run(SELECT.one.from(Reembolsos).where({ ID }))

    this.on('aprovarReembolso', Reembolsos, async (req: Request<ParametrosDecisao>) => {
      const reembolso = await solicitacaoPendente(req)
      if (!reembolso) return
      if (!(await registrarDecisao(req, reembolso.ID, 'APROVADO', req.data.motivoDecisao?.trim()))) return
      await cancelarPorReembolso(req, reembolso.pedido_ID)
      if (req.errors) return
      info(req, 'REEMBOLSO_APROVADO', { numero: reembolso.numeroPedido })
      return resultado(reembolso.ID)
    })

    this.on('rejeitarReembolso', Reembolsos, async (req: Request<ParametrosDecisao>) => {
      const reembolso = await solicitacaoPendente(req)
      if (!reembolso) return
      const motivo = req.data.motivoDecisao?.trim()
      if (!motivo) return erro(req, 400, 'REEMBOLSO_MOTIVO_DECISAO_OBRIG', {}, 'motivoDecisao')
      if (!(await registrarDecisao(req, reembolso.ID, 'REJEITADO', motivo))) return
      await retomarPedido(req, reembolso.pedido_ID, reembolso.statusPedidoAnterior_code)
      if (req.errors) return
      info(req, 'REEMBOLSO_REJEITADO', { numero: reembolso.numeroPedido })
      return resultado(reembolso.ID)
    })

    return super.init()
  }
}
