using {pedidoscompras as db} from '../db/schema';

/**
 * Aplicação Gestão de Reembolsos (equivalente ao serviço ZUI_PC_REEMBOLSOS).
 * As solicitações são criadas pelo cancelamento de pedidos com pagamento
 * aprovado; aqui só são consultadas e decididas.
 */
@path    : 'reembolsos'
@requires: 'authenticated-user'
service ReembolsosService {

  @readonly
  @restrict: [{
    grant: '*',
    to   : [
      'Comum',
      'Admin'
    ]
  }]
  entity Reembolsos      as projection on db.Reembolsos {
    *,
    cliente.nome         as nomeCliente,
    cliente.cpf          as cpfCliente,
    cliente.cpfFormatado as cpfClienteFormatado
  }
    actions {
      /** Cancela o pedido (libera a reserva, gera snapshots) e devolve o pagamento. */
      @(
        Core.OperationAvailable: ($self.statusReembolso.code = 'PENDENTE'),
        Common.SideEffects     : {TargetEntities: [in]}
      )
      action aprovarReembolso(motivoDecisao : String(500)) returns Reembolsos;

      /** O pedido retoma o status anterior à solicitação. Motivo obrigatório. */
      @(
        Core.OperationAvailable: ($self.statusReembolso.code = 'PENDENTE'),
        Common.SideEffects     : {TargetEntities: [in]}
      )
      action rejeitarReembolso(@mandatory motivoDecisao : String(500)) returns Reembolsos;
    };

  @readonly
  entity StatusReembolso as projection on db.StatusReembolso;

  @readonly
  entity StatusPedido    as projection on db.StatusPedido;
}
