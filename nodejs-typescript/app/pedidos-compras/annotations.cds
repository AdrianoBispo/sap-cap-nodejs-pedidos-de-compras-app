/*
 * UI da aplicação Pedidos de Compras (porte de ZC_PC_PEDIDO_APP.ddlx e das
 * metadata extensions dos itens, pagamento e snapshots).
 *
 * Object Page dinâmica: Dados do Cliente e Itens existem em duas versões com
 * o mesmo título; pedido FINALIZADO/CANCELADO mostra os snapshots, os demais
 * status mostram os dados atuais. As seções Finalização e Cancelamento só
 * aparecem no status correspondente. Os indicadores são elementos calculados
 * (encerrado, naoEncerrado, naoFinalizado, naoCancelado).
 */
using PedidosService as service from '../../srv/pedidos-service';

annotate service.Pedidos with @(
  Common.SemanticKey              : [numeroPedido],
  UI.HeaderInfo                   : {
    TypeName      : 'Pedido de compra',
    TypeNamePlural: 'Pedidos de compras',
    Title         : {Value: numeroPedido},
    Description   : {Value: cliente.nome}
  },
  UI.SelectionFields              : [
    cliente_ID,
    cpfCliente,
    statusPedido_code,
    statusPagamento_code,
    createdAt,
    valorTotal
  ],
  UI.LineItem                     : [
    {
      $Type  : 'UI.DataFieldForActionGroup',
      ID     : 'AcoesPedido',
      Label  : 'Ações',
      Actions: [
        {
          $Type : 'UI.DataFieldForAction',
          Action: 'PedidosService.efetuarPagamento',
          Label : 'Efetuar Pagamento'
        },
        {
          $Type : 'UI.DataFieldForAction',
          Action: 'PedidosService.aprovarPedido',
          Label : 'Aprovar pedido'
        },
        {
          $Type : 'UI.DataFieldForAction',
          Action: 'PedidosService.cancelarPedido',
          Label : 'Cancelar pedido'
        }
      ]
    },
    {
      Value            : numeroPedido,
      ![@UI.Importance]: #High
    },
    {Value: cpfCliente},
    {
      Value            : cliente_ID,
      Label            : 'Cliente',
      ![@UI.Importance]: #High
    },
    {
      Value            : statusPedido_code,
      Criticality      : statusPedido.criticality,
      ![@UI.Importance]: #High
    },
    {
      Value      : statusPagamento_code,
      Criticality: statusPagamento.criticality
    },
    {
      Value            : valorTotal,
      Label            : 'Total',
      ![@UI.Importance]: #High
    },
    {Value: createdAt},
    {Value: dataFinalizacao}
  ],
  UI.PresentationVariant          : {
    SortOrder     : [{
      Property  : createdAt,
      Descending: true
    }],
    Visualizations: ['@UI.LineItem'],
    // CPF sempre carregado: é o parâmetro da navegação para o cliente
    RequestAtLeast: [cpfCliente]
  },
  UI.Identification               : [{
    $Type        : 'UI.DataFieldForActionGroup',
    ID           : 'AcoesPedidoOP',
    Label        : 'Ações',
    // Pedido FINALIZADO ou CANCELADO não tem ações
    ![@UI.Hidden]: encerrado,
    Actions      : [
      {
        $Type : 'UI.DataFieldForAction',
        Action: 'PedidosService.efetuarPagamento',
        Label : 'Efetuar Pagamento'
      },
      {
        $Type : 'UI.DataFieldForAction',
        Action: 'PedidosService.aprovarPedido',
        Label : 'Aprovar pedido'
      },
      {
        $Type : 'UI.DataFieldForAction',
        Action: 'PedidosService.cancelarPedido',
        Label : 'Cancelar pedido'
      }
    ]
  }],
  // Editar só no status ABERTO (apenas os itens); o pedido registrado não é excluído
  UI.UpdateHidden                 : (statusPedido.code <> 'ABERTO'),
  UI.DeleteHidden                 : true,
  UI.HeaderFacets                 : [
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'HeaderStatus',
      Target: '@UI.DataPoint#StatusPedido'
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'HeaderPagamento',
      Target: '@UI.DataPoint#StatusPagamento'
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'HeaderTotal',
      Target: '@UI.DataPoint#ValorTotal'
    }
  ],
  UI.DataPoint #StatusPedido      : {
    Value      : statusPedido_code,
    Title      : 'Status do pedido',
    Criticality: statusPedido.criticality
  },
  UI.DataPoint #StatusPagamento   : {
    Value      : statusPagamento_code,
    Title      : 'Pagamento',
    Criticality: statusPagamento.criticality
  },
  UI.DataPoint #ValorTotal        : {
    Value: valorTotal,
    Title: 'Valor total'
  },
  UI.Facets                       : [
    {
      $Type        : 'UI.ReferenceFacet',
      ID           : 'DadosCliente',
      Label        : 'Dados do Cliente',
      Target       : '@UI.FieldGroup#Cliente',
      ![@UI.Hidden]: encerrado
    },
    {
      $Type        : 'UI.ReferenceFacet',
      ID           : 'DadosClienteSnap',
      Label        : 'Dados do Cliente',
      Target       : 'clienteSnapshot/@UI.FieldGroup#Snapshot',
      ![@UI.Hidden]: naoEncerrado
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'DadosPedido',
      Label : 'Dados do Pedido',
      Target: '@UI.FieldGroup#Pedido'
    },
    {
      $Type        : 'UI.ReferenceFacet',
      ID           : 'Itens',
      Label        : 'Itens',
      Target       : 'itens/@UI.LineItem',
      ![@UI.Hidden]: encerrado
    },
    {
      $Type        : 'UI.ReferenceFacet',
      ID           : 'ItensSnap',
      Label        : 'Itens',
      Target       : 'itensSnapshot/@UI.LineItem',
      ![@UI.Hidden]: naoEncerrado
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'Pagamento',
      Label : 'Pagamento (última tentativa)',
      Target: 'pagamento/@UI.FieldGroup#Pagamento'
    },
    {
      $Type        : 'UI.ReferenceFacet',
      ID           : 'Finalizacao',
      Label        : 'Finalização',
      Target       : '@UI.FieldGroup#Finalizacao',
      ![@UI.Hidden]: naoFinalizado
    },
    {
      $Type        : 'UI.ReferenceFacet',
      ID           : 'Cancelamento',
      Label        : 'Cancelamento',
      Target       : '@UI.FieldGroup#Cancelamento',
      ![@UI.Hidden]: naoCancelado
    }
  ],
  UI.FieldGroup #Cliente          : {Data: [
    // Só o cliente é informado; os demais dados vêm da associação (somente leitura)
    {Value: cliente_ID},
    {Value: cpfCliente},
    {
      Value: cliente.email,
      Label: 'E-mail'
    },
    {
      Value: cliente.telefoneFormatado,
      Label: 'Telefone'
    },
    {
      Value: cliente.genero_code,
      Label: 'Gênero'
    },
    {
      Value: cliente.dataNascimento,
      Label: 'Data de nascimento'
    },
    {Value: enderecoPrincipalCompleto}
  ]},
  UI.FieldGroup #Pedido           : {Data: [
    {Value: numeroPedido},
    {
      Value      : statusPedido_code,
      Criticality: statusPedido.criticality
    },
    {
      Value      : statusPagamento_code,
      Criticality: statusPagamento.criticality
    },
    {Value: observacao},
    {Value: referenciaImportacao},
    {Value: valorTotal},
    {Value: createdAt},
    {Value: createdBy},
    {Value: modifiedAt},
    {Value: modifiedBy}
  ]},
  UI.FieldGroup #Finalizacao      : {Data: [{Value: dataFinalizacao}]},
  UI.FieldGroup #Cancelamento     : {Data: [
    {Value: motivoCancelamento},
    {Value: dataCancelamento},
    {Value: canceladoPor}
  ]},
  // Troca de cliente: o backend usa o endereço principal atual e a UI
  // recarrega os dados do cliente pela associação
  Common.SideEffects #Cliente     : {
    SourceProperties: [cliente_ID],
    TargetProperties: [
      'endereco_ID',
      'enderecoPrincipalCompleto',
      'cpfCliente',
      'cpfClienteFormatado'
    ],
    TargetEntities  : [cliente]
  },
  // Inclusão ou exclusão de itens no rascunho: total do pedido
  Common.SideEffects #Itens       : {
    SourceEntities  : [itens],
    TargetProperties: ['valorTotal']
  }
) {
  // O cliente é escolhido na criação (obrigatório); depois do registro fica somente leitura.
  // Cliente e CPF abrem o cliente na Gestão de Clientes (chave semântica: cpf)
  cliente               @Common.FieldControl: (case when numeroPedido is null then 7 else 1 end)  @Common: {
    Text                 : cliente.nome,
    TextArrangement      : #TextOnly,
    SemanticObject       : 'Cliente',
    SemanticObjectMapping: [{
      LocalProperty         : cpfCliente,
      SemanticObjectProperty: 'cpf'
    }],
    ValueList            : {
      Label         : 'Clientes ativos',
      CollectionPath: 'ClientesAtivos',
      Parameters    : [
        {
          $Type            : 'Common.ValueListParameterInOut',
          LocalDataProperty: cliente_ID,
          ValueListProperty: 'ID'
        },
        {
          $Type            : 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'cpfFormatado'
        },
        {
          $Type            : 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'nome'
        },
        {
          $Type            : 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'email'
        },
        {
          $Type            : 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'cidade'
        },
        {
          $Type            : 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'uf'
        }
      ]
    }
  };
  endereco              @Common: {
    Text           : enderecoPrincipalCompleto,
    TextArrangement: #TextOnly
  };
  statusPedido          @Common.ValueListWithFixedValues;
  statusPagamento       @Common.ValueListWithFixedValues;
  nomeCliente           @title: 'Cliente'  @Common.SemanticObject: 'Cliente';
  cpfCliente            @title: 'CPF'  @Common: {
    Text                 : cpfClienteFormatado,
    TextArrangement      : #TextOnly,
    SemanticObject       : 'Cliente',
    SemanticObjectMapping: [{
      LocalProperty         : cpfCliente,
      SemanticObjectProperty: 'cpf'
    }]
  };
  cpfClienteFormatado   @title: 'CPF';
  emailCliente          @title: 'E-mail';
  telefoneCliente       @title: 'Telefone';
  generoCliente         @title: 'Gênero';
  dataNascimentoCliente @title: 'Data de nascimento';
};

// Na UI, "Efetuar Pagamento" abre o diálogo com campos mascarados de
// webapp/ext/EfetuarPagamento.js (o manifest troca o item dos grupos de ações
// AcoesPedido/AcoesPedidoOP pela ação customizada, que chama esta mesma action).
// Os títulos abaixo valem para chamadas sem o diálogo customizado.
annotate service.Pedidos actions {
  efetuarPagamento @(
    Common.IsActionCritical: false
  )(
    metodoPagamento @title: 'Método de pagamento' @Common: {
      ValueListWithFixedValues: true,
      ValueList               : {
        CollectionPath: 'MetodosPagamento',
        Parameters    : [{
          $Type            : 'Common.ValueListParameterInOut',
          LocalDataProperty: metodoPagamento,
          ValueListProperty: 'code'
        }]
      }
    },
    numeroCartao    @title: 'Número do cartão',
    validade        @title: 'Validade (MM/AA)',
    cvv             @title: 'CVV'
  );
  aprovarPedido    @Common.IsActionCritical;
  cancelarPedido(
    motivoCancelamento @title: 'Motivo do cancelamento'  @UI.MultiLineText
  );
};

annotate service.ItensPedido with @(
  UI.HeaderInfo         : {
    TypeName      : 'Item do pedido',
    TypeNamePlural: 'Itens do pedido',
    Title         : {Value: item.nome},
    Description   : {Value: item.sku}
  },
  UI.LineItem           : [
    {
      Value            : item_ID,
      ![@UI.Importance]: #High
    },
    {Value: skuItem},
    {
      Value: item.qtdeDisponivel,
      Label: 'Disponível agora'
    },
    {
      Value            : qtdeItemPedido,
      ![@UI.Importance]: #High
    },
    {Value: precoUnitarioSnapshot},
    {
      Value            : valorTotal,
      ![@UI.Importance]: #High
    }
  ],
  UI.Facets             : [{
    $Type : 'UI.ReferenceFacet',
    ID    : 'DadosItem',
    Label : 'Item',
    Target: '@UI.FieldGroup#Item'
  }],
  UI.FieldGroup #Item   : {Data: [
    {Value: item_ID},
    {Value: skuItem},
    {
      Value: item.qtdeDisponivel,
      Label: 'Qtde disponível agora (informativo)'
    },
    {Value: qtdeItemPedido},
    {Value: precoUnitarioSnapshot},
    {Value: valorTotal},
    {Value: observacao}
  ]},
  // Item/quantidade alterados: preço, total da linha e total do pedido
  Common.SideEffects #Valores: {
    SourceProperties: [
      item_ID,
      qtdeItemPedido
    ],
    TargetProperties: [
      'skuItem',
      'precoUnitarioSnapshot',
      'valorTotal',
      'currency_code',
      'pedido/valorTotal'
    ]
  }
) {
  // Item e SKU abrem o item na Gestão de Estoque (chave semântica: sku)
  item    @Common: {
    Text                 : item.nome,
    TextArrangement      : #TextOnly,
    SemanticObject       : 'ItemEstoque',
    SemanticObjectMapping: [{
      LocalProperty         : skuItem,
      SemanticObjectProperty: 'sku'
    }],
    ValueList            : {
      Label         : 'Itens ativos',
      CollectionPath: 'ItensAtivos',
      Parameters    : [
        {
          $Type            : 'Common.ValueListParameterInOut',
          LocalDataProperty: item_ID,
          ValueListProperty: 'ID'
        },
        {
          $Type            : 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'sku'
        },
        {
          $Type            : 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'nome'
        },
        {
          $Type            : 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'precoUnitario'
        },
        {
          $Type            : 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'qtdeDisponivel'
        },
        {
          $Type            : 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'statusEstoque_code'
        }
      ]
    }
  };
  skuItem @Common: {
    SemanticObject       : 'ItemEstoque',
    SemanticObjectMapping: [{
      LocalProperty         : skuItem,
      SemanticObjectProperty: 'sku'
    }]
  };
};

annotate service.Pagamentos with @(UI.FieldGroup #Pagamento: {Data: [
  {Value: metodoPagamento_code},
  {
    Value      : statusPagamento_code,
    Criticality: statusPagamento.criticality
  },
  {Value: bandeiraCartao},
  {Value: cartaoMascarado},
  {Value: codigoAutorizacao},
  {Value: mensagemPagamento},
  {Value: dataPagamento}
]});

annotate service.PedidosClienteSnapshots with @(UI.FieldGroup #Snapshot: {Data: [
  {Value: nome},
  {Value: cpfFormatado},
  {Value: email},
  {Value: telefoneFormatado},
  {Value: genero_code},
  {Value: dataNascimento},
  {Value: enderecoCompleto},
  {Value: createdAt}
]});

annotate service.PedidosItensSnapshots with @(
  UI.HeaderInfo: {
    TypeName      : 'Item do pedido (histórico)',
    TypeNamePlural: 'Itens do pedido',
    Title         : {Value: nome},
    Description   : {Value: sku}
  },
  UI.LineItem  : [
    {
      Value            : nome,
      ![@UI.Importance]: #High
    },
    {Value: sku},
    {
      Value            : quantidade,
      ![@UI.Importance]: #High
    },
    {Value: precoUnitario},
    {
      Value            : valorTotal,
      ![@UI.Importance]: #High
    }
  ]
);

annotate service.ClientesAtivos with {
  ID           @title: 'Cliente'  @Common.Text: nome  @Common.TextArrangement: #TextOnly;
  cpfFormatado @title: 'CPF';
  nome         @title: 'Nome';
  email        @title: 'E-mail';
  cidade       @title: 'Cidade';
  uf           @title: 'UF';
};

annotate service.ItensAtivos with {
  ID                 @title: 'Item'  @Common.Text: nome  @Common.TextArrangement: #TextOnly;
  sku                @title: 'SKU';
  nome               @title: 'Item';
  precoUnitario      @title: 'Preço unitário';
  qtdeDisponivel     @title: 'Qtde disponível';
  statusEstoque_code @title: 'Status do estoque';
};

// Dados do cliente exibidos no pedido: sempre somente leitura (a entidade é
// @readonly no serviço; aqui também saem as regras de entrada herdadas)
annotate service.Clientes with {
  cpf               @Core.Computed  @mandatory: false;
  cpfFormatado      @Core.Computed  @title: 'CPF';
  nome              @Core.Computed  @mandatory: false;
  email             @Core.Computed  @mandatory: false  @assert.format: null;
  telefoneFormatado @Core.Computed  @title: 'Telefone';
  genero            @Core.Computed;
  dataNascimento    @Core.Computed  @mandatory: false;
  clienteAtivo      @Core.Computed;
};
