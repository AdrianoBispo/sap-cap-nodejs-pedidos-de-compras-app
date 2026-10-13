using {pedidoscompras as db} from '../db/schema';
using {pedidoscompras.ResultadoImportacao} from './common';

/**
 * Aplicação Pedidos de Compras.
 *
 * Ciclo de vida: rascunho -> Salvar registra o pedido (ABERTO) e reserva o
 * estoque -> Efetuar Pagamento -> Aprovar pedido (FINALIZADO) ou Cancelar.
 * Clientes e itens são consumidos como entidades somente leitura (value helps).
 */
@path    : 'pedidos'
@requires: 'authenticated-user'
service PedidosService {

  @odata.draft.enabled
  @restrict: [{
    grant: '*',
    to   : [
      'Comum',
      'Admin'
    ]
  }]
  entity Pedidos                 as projection on db.Pedidos {
    *,
    cliente.nome              as nomeCliente,
    cliente.cpf               as cpfCliente,
    cliente.cpfFormatado      as cpfClienteFormatado,
    cliente.email             as emailCliente,
    cliente.telefoneFormatado as telefoneCliente,
    cliente.genero.name       as generoCliente,
    cliente.dataNascimento    as dataNascimentoCliente,
    /** Sem solicitação de reembolso: esconde o link para a Gestão de Reembolsos. */
    case
      when exists reembolsos then false
      else true
    end                       as semReembolso : Boolean
  }
    excluding {
      reembolsos
    }
    actions {
      /** Pagamento simulado com cartão. Dados do cartão só em memória. */
      @(
        Core.OperationAvailable: ($self.statusPedido.code = 'ABERTO'),
        Common.SideEffects     : {TargetEntities: [
          in,
          in.pagamento
        ]}
      )
      action efetuarPagamento(
        @mandatory metodoPagamento : String(20),
        @mandatory numeroCartao    : String(19),
        @mandatory validade        : String(5),
        @mandatory cvv             : String(4)) returns Pedidos;

      /** Baixa o estoque reservado, gera os snapshots e finaliza o pedido. */
      @(
        Core.OperationAvailable: ($self.statusPedido.code = 'AGUARDANDO_APROVACAO'),
        Common.SideEffects     : {TargetEntities: [
          in,
          in.clienteSnapshot,
          in.itensSnapshot
        ]}
      )
      action aprovarPedido() returns Pedidos;

      /**
       * Cancela o pedido (libera a reserva e gera os snapshots). Com pagamento
       * aprovado abre uma solicitação de reembolso (PROCESSANDO_REEMBOLSO).
       */
      @(
        Core.OperationAvailable: ($self.statusPedido.code = 'ABERTO' or $self.statusPedido.code = 'AGUARDANDO_APROVACAO'),
        Common.SideEffects     : {TargetEntities: [
          in,
          in.clienteSnapshot,
          in.itensSnapshot
        ]}
      )
      action cancelarPedido(
        @mandatory motivoCancelamento : String(500)) returns Pedidos;
    };

  /** Itens do pedido; o SKU vem do item (navegação para a Gestão de Estoque). */
  entity ItensPedido             as projection on db.ItensPedido {
    *,
    item.sku as skuItem
  };

  /** Clientes (somente leitura): textos e value help do pedido. */
  @readonly
  entity Clientes                as projection on db.Clientes {
    ID,
    cpf,
    cpfFormatado,
    nome,
    email,
    telefoneFormatado,
    genero,
    dataNascimento,
    clienteAtivo,
    enderecoPrincipal.cidade as cidade,
    enderecoPrincipal.uf     as uf
  };

  /** Value help: apenas clientes ativos podem fazer novos pedidos. */
  @readonly
  entity ClientesAtivos          as projection on Clientes
                                    where
                                      clienteAtivo = true;

  @readonly
  entity Enderecos               as projection on db.Enderecos {
    ID,
    cliente,
    cep,
    cepFormatado,
    enderecoCompleto,
    cidade,
    uf,
    principal
  };

  /** Itens (somente leitura): textos e value help dos itens do pedido. */
  @readonly
  entity Itens                   as projection on db.Itens {
    ID,
    sku,
    nome,
    categoria,
    precoUnitario,
    currency,
    qtdeDisponivel,
    statusEstoque_code,
    statusEstoque,
    itemAtivo
  };

  /** Value help: apenas itens ativos. */
  @readonly
  entity ItensAtivos             as projection on Itens
                                    where
                                      itemAtivo = true;

  @readonly
  entity StatusPedido            as projection on db.StatusPedido;

  @readonly
  entity StatusPagamento         as projection on db.StatusPagamento;

  @readonly
  entity MetodosPagamento        as projection on db.MetodosPagamento;

  /**
   * Importação em massa por planilha (.xlsx ou .csv): uma linha por item;
   * linhas com a mesma referência formam um pedido. Tudo ou nada.
   */
  action importarPlanilha(arquivo : LargeBinary not null, nomeArquivo : String(255)) returns ResultadoImportacao;
}

/*
 * No pedido o usuário informa apenas o cliente (e os itens): os dados do
 * cliente vêm da associação e são somente leitura (não herdam o @mandatory
 * da entidade Clientes). Pagamento e snapshots só são gravados pelas actions
 * (efetuarPagamento, aprovarPedido, cancelarPedido), nunca pela tela.
 */
annotate PedidosService.Pedidos with {
  nomeCliente           @Core.Computed  @mandatory: false;
  cpfCliente            @Core.Computed  @mandatory: false;
  cpfClienteFormatado   @Core.Computed  @mandatory: false;
  emailCliente          @Core.Computed  @mandatory: false  @assert.format: null;
  telefoneCliente       @Core.Computed  @mandatory: false;
  generoCliente         @Core.Computed  @mandatory: false;
  dataNascimentoCliente @Core.Computed  @mandatory: false;
};

annotate PedidosService.ItensPedido with {
  skuItem @Core.Computed;
};

annotate PedidosService.Pagamentos with @readonly {
  metodoPagamento       @Core.Computed;
  statusPagamento       @Core.Computed;
  bandeiraCartao        @Core.Computed;
  ultimos4DigitosCartao @Core.Computed;
  cartaoMascarado       @Core.Computed;
  codigoAutorizacao     @Core.Computed;
  mensagemPagamento     @Core.Computed;
  dataPagamento         @Core.Computed;
};
annotate PedidosService.PedidosClienteSnapshots with @readonly;
annotate PedidosService.PedidosItensSnapshots with @readonly;
