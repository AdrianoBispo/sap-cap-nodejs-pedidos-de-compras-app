/*
 * Anotações comuns às aplicações: rótulos, textos das CodeLists, value helps
 * de valores fixos e campos mantidos somente pelo backend. Ficam no modelo de
 * domínio e se propagam para todos os serviços que expõem as entidades.
 */
using {pedidoscompras as db} from '../db/schema';
using {sap.common.Currencies} from '@sap/cds/common';

// ---------------------------------------------------------------------------
// CodeLists: valores fixos (drop-down) e textos
// ---------------------------------------------------------------------------

annotate db.Generos with @(UI.Identification: [{Value: name}]) {
  code @title: 'Gênero' @Common.Text: name @Common.TextArrangement: #TextOnly;
  name @title: 'Gênero';
};

annotate db.Categorias with {
  code @title: 'Categoria' @Common.Text: name @Common.TextArrangement: #TextOnly;
  name @title: 'Categoria';
};

annotate db.StatusEstoque with {
  code @title: 'Status do estoque' @Common.Text: name @Common.TextArrangement: #TextOnly;
};

annotate db.StatusPedido with {
  code @title: 'Status do pedido' @Common.Text: name @Common.TextArrangement: #TextOnly;
};

annotate db.StatusPagamento with {
  code @title: 'Status do pagamento' @Common.Text: name @Common.TextArrangement: #TextOnly;
};

annotate db.StatusReembolso with {
  code @title: 'Status do reembolso' @Common.Text: name @Common.TextArrangement: #TextOnly;
};

annotate db.MetodosPagamento with {
  code @title: 'Método de pagamento' @Common.Text: name @Common.TextArrangement: #TextOnly;
};

// ---------------------------------------------------------------------------
// Clientes e endereços
// ---------------------------------------------------------------------------

annotate db.Clientes with {
  ID                  @UI.Hidden;
  fotoCliente         @title: 'Foto (JPEG, PNG ou WEBP)';
  fotoClienteMimeType @UI.Hidden;
  fotoClienteNome     @UI.Hidden;
  cpf                 @title: 'CPF (somente números)';
  cpfFormatado        @title: 'CPF';
  nome                @title: 'Nome completo';
  email               @title: 'E-mail';
  telefone            @title: 'Telefone (DDD + número)';
  telefoneFormatado   @title: 'Telefone';
  genero              @title: 'Gênero'  @Common: {
    Text                    : genero.name,
    TextArrangement         : #TextOnly,
    ValueListWithFixedValues: true
  };
  dataNascimento      @title: 'Data de nascimento';
  clienteAtivo        @title: 'Cliente ativo';
  scoreCliente        @title: 'Score (%)'  @Common.FieldControl: #ReadOnly;
  scoreCriticality    @UI.Hidden;
  createdAt           @title: 'Criado em';
  createdBy           @title: 'Criado por';
  modifiedAt          @title: 'Alterado em';
  modifiedBy          @title: 'Alterado por';
};

annotate db.Enderecos with {
  ID               @UI.Hidden;
  cliente          @UI.Hidden;
  cep              @title: 'CEP (somente números)';
  cepFormatado     @title: 'CEP';
  logradouro       @title: 'Logradouro';
  numero           @title: 'Número';
  complemento      @title: 'Complemento';
  bairro           @title: 'Bairro';
  cidade           @title: 'Cidade'  @Common.FieldControl: #ReadOnly;
  uf               @title: 'UF'  @Common.FieldControl: #ReadOnly;
  estado           @title: 'Estado'  @Common.FieldControl: #ReadOnly;
  cepGeral         @UI.Hidden;
  cepStatus        @UI.Hidden;
  controleCampoCep @UI.Hidden;
  principal        @title: 'Endereço principal'  @Common.FieldControl: #ReadOnly;
  enderecoCompleto @title: 'Endereço completo';
};

// ---------------------------------------------------------------------------
// Estoque
// ---------------------------------------------------------------------------

annotate db.Itens with {
  ID               @UI.Hidden;
  fotoItem         @title: 'Foto (JPEG, PNG ou WEBP)';
  fotoItemMimeType @UI.Hidden;
  fotoItemNome     @UI.Hidden;
  sku              @title: 'SKU'  @Common.FieldControl: #ReadOnly;
  nome             @title: 'Nome';
  descricao        @title: 'Descrição'  @UI.MultiLineText;
  categoria        @title: 'Categoria'  @Common: {
    Text                    : categoria.name,
    TextArrangement         : #TextOnly,
    ValueListWithFixedValues: true
  };
  qtdeEstoque      @title: 'Quantidade em estoque';
  qtdeReservada    @title: 'Quantidade reservada'  @Common.FieldControl: #ReadOnly;
  qtdeDisponivel   @title: 'Quantidade disponível';
  statusEstoque    @title: 'Status';
  currency         @title: 'Moeda';
  precoUnitario    @title: 'Preço unitário'  @Measures.ISOCurrency: currency_code;
  itemAtivo        @title: 'Item ativo';
};

// ---------------------------------------------------------------------------
// Pedidos, itens, pagamento e snapshots
// ---------------------------------------------------------------------------

annotate db.Pedidos with {
  ID                        @UI.Hidden;
  numeroPedido              @title: 'Pedido'  @Common.FieldControl: #ReadOnly;
  cliente                   @title: 'Cliente';
  endereco                  @title: 'Endereço de entrega (principal)'  @Common.FieldControl: #ReadOnly;
  enderecoPrincipalCompleto @title: 'Endereço de entrega (principal)'  @Common.FieldControl: #ReadOnly;
  statusPedido              @title: 'Status do pedido'  @Common.FieldControl: #ReadOnly;
  statusPagamento           @title: 'Status do pagamento'  @Common.FieldControl: #ReadOnly;
  observacao                @title: 'Observação'  @UI.MultiLineText  @Common.FieldControl: #ReadOnly;
  referenciaImportacao      @title: 'Referência de importação'  @Common.FieldControl: #ReadOnly;
  currency                  @UI.Hidden;
  valorTotal                @title: 'Valor total'  @Common.FieldControl: #ReadOnly  @Measures.ISOCurrency: currency_code;
  dataFinalizacao           @title: 'Data de finalização'  @Common.FieldControl: #ReadOnly;
  motivoCancelamento        @title: 'Motivo do cancelamento'  @Common.FieldControl: #ReadOnly;
  dataCancelamento          @title: 'Data do cancelamento'  @Common.FieldControl: #ReadOnly;
  canceladoPor              @title: 'Cancelado por'  @Common.FieldControl: #ReadOnly;
  encerrado                 @UI.Hidden;
  naoEncerrado              @UI.Hidden;
  naoFinalizado             @UI.Hidden;
  naoCancelado              @UI.Hidden;
  createdAt                 @title: 'Data do pedido';
  createdBy                 @title: 'Criado por';
  modifiedAt                @title: 'Alterado em';
  modifiedBy                @title: 'Alterado por';
};

annotate db.ItensPedido with {
  ID                    @UI.Hidden;
  pedido                @UI.Hidden;
  item                  @title: 'Item';
  qtdeItemPedido        @title: 'Quantidade';
  precoUnitarioSnapshot @title: 'Preço unitário'  @Common.FieldControl: #ReadOnly  @Measures.ISOCurrency: currency_code;
  currency              @UI.Hidden;
  valorTotal            @title: 'Total do item'  @Common.FieldControl: #ReadOnly  @Measures.ISOCurrency: currency_code;
  observacao            @title: 'Observação';
};

annotate db.Pagamentos with {
  ID                    @UI.Hidden;
  pedido                @UI.Hidden;
  metodoPagamento       @title: 'Método';
  statusPagamento       @title: 'Status';
  bandeiraCartao        @title: 'Bandeira';
  ultimos4DigitosCartao @UI.Hidden;
  cartaoMascarado       @title: 'Cartão';
  codigoAutorizacao     @title: 'Código de autorização';
  mensagemPagamento     @title: 'Mensagem';
  dataPagamento         @title: 'Data da tentativa';
};

annotate db.PedidosClienteSnapshots with {
  ID                @UI.Hidden;
  pedido            @UI.Hidden;
  cliente           @UI.Hidden;
  endereco          @UI.Hidden;
  nome              @title: 'Cliente';
  cpfFormatado      @title: 'CPF';
  email             @title: 'E-mail';
  telefoneFormatado @title: 'Telefone';
  genero            @title: 'Gênero'  @Common: {
    Text           : genero.name,
    TextArrangement: #TextOnly
  };
  dataNascimento    @title: 'Data de nascimento';
  enderecoCompleto  @title: 'Endereço de entrega (principal)';
  motivoSnapshot    @title: 'Motivo';
  createdAt         @title: 'Gerado em';
};

annotate db.PedidosItensSnapshots with {
  ID            @UI.Hidden;
  pedido        @UI.Hidden;
  itemPedido    @UI.Hidden;
  item          @UI.Hidden;
  sku           @title: 'SKU';
  nome          @title: 'Item';
  descricao     @title: 'Descrição';
  categoria     @title: 'Categoria';
  quantidade    @title: 'Quantidade';
  precoUnitario @title: 'Preço unitário'  @Measures.ISOCurrency: currency_code;
  valorTotal    @title: 'Total do item'  @Measures.ISOCurrency: currency_code;
};

// ---------------------------------------------------------------------------
// Reembolsos
// ---------------------------------------------------------------------------

annotate db.Reembolsos with {
  ID                   @UI.Hidden;
  pedido               @UI.Hidden;
  cliente              @UI.Hidden;
  numeroPedido         @title: 'Pedido';
  statusReembolso      @title: 'Status do reembolso';
  statusPedidoAnterior @title: 'Status anterior do pedido';
  currency             @UI.Hidden;
  valorReembolso       @title: 'Valor do reembolso'  @Measures.ISOCurrency: currency_code;
  motivoSolicitacao    @title: 'Motivo da solicitação'  @UI.MultiLineText;
  dataSolicitacao      @title: 'Solicitado em';
  solicitadoPor        @title: 'Solicitado por';
  motivoDecisao        @title: 'Motivo da decisão'  @UI.MultiLineText;
  dataDecisao          @title: 'Decidido em';
  decididoPor          @title: 'Decidido por';
};

annotate Currencies with {
  code @title: 'Moeda';
};

// ---------------------------------------------------------------------------
// Textos das CodeLists nas associações (a UI mostra a descrição, não o código)
// ---------------------------------------------------------------------------

annotate db.Pedidos with {
  statusPedido    @Common.Text: statusPedido.name     @Common.TextArrangement: #TextOnly;
  statusPagamento @Common.Text: statusPagamento.name  @Common.TextArrangement: #TextOnly;
};

annotate db.Pagamentos with {
  metodoPagamento @Common.Text: metodoPagamento.name  @Common.TextArrangement: #TextOnly;
  statusPagamento @Common.Text: statusPagamento.name  @Common.TextArrangement: #TextOnly;
};

annotate db.Reembolsos with {
  statusReembolso      @Common.Text: statusReembolso.name       @Common.TextArrangement: #TextOnly;
  statusPedidoAnterior @Common.Text: statusPedidoAnterior.name  @Common.TextArrangement: #TextOnly;
};

annotate db.PedidosItensSnapshots with {
  categoria @Common.Text: categoria.name  @Common.TextArrangement: #TextOnly;
};
