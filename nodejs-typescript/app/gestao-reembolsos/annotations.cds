/*
 * UI da aplicação Gestão de Reembolsos.
 * Lista somente leitura com as ações Aprovar e Rejeitar.
 */
using ReembolsosService as service from '../../srv/reembolsos-service';

annotate service.Reembolsos with @(
  Common.SemanticKey       : [numeroPedido],
  UI.HeaderInfo            : {
    TypeName      : 'Reembolso',
    TypeNamePlural: 'Reembolsos',
    Title         : {Value: numeroPedido},
    Description   : {Value: nomeCliente}
  },
  UI.SelectionFields       : [
    numeroPedido,
    nomeCliente,
    statusReembolso_code
  ],
  UI.LineItem              : [
    {
      $Type : 'UI.DataFieldForAction',
      Action: 'ReembolsosService.aprovarReembolso',
      Label : 'Aprovar'
    },
    {
      $Type : 'UI.DataFieldForAction',
      Action: 'ReembolsosService.rejeitarReembolso',
      Label : 'Rejeitar'
    },
    {
      $Type            : 'UI.DataFieldWithIntentBasedNavigation',
      Value            : numeroPedido,
      SemanticObject   : 'PedidoCompra',
      Action           : 'manage',
      ![@UI.Importance]: #High
    },
    {
      Value            : nomeCliente,
      ![@UI.Importance]: #High
    },
    {
      Value            : statusReembolso_code,
      Criticality      : statusReembolso.criticality,
      ![@UI.Importance]: #High
    },
    {
      Value: valorReembolso,
      Label: 'Valor'
    },
    {Value: motivoSolicitacao},
    {Value: dataSolicitacao},
    {Value: motivoDecisao}
  ],
  UI.PresentationVariant   : {
    SortOrder     : [{
      Property  : dataSolicitacao,
      Descending: true
    }],
    Visualizations: ['@UI.LineItem'],
    // CPF sempre carregado: é o parâmetro da navegação para o cliente
    RequestAtLeast: [cpfCliente]
  },
  UI.Identification        : [
    {
      $Type : 'UI.DataFieldForAction',
      Action: 'ReembolsosService.aprovarReembolso',
      Label : 'Aprovar reembolso'
    },
    {
      $Type : 'UI.DataFieldForAction',
      Action: 'ReembolsosService.rejeitarReembolso',
      Label : 'Rejeitar reembolso'
    }
  ],
  UI.HeaderFacets          : [{
    $Type : 'UI.ReferenceFacet',
    ID    : 'HeaderStatus',
    Target: '@UI.DataPoint#Status'
  }],
  UI.DataPoint #Status     : {
    Value      : statusReembolso_code,
    Title      : 'Status',
    Criticality: statusReembolso.criticality
  },
  UI.Facets                : [{
    $Type : 'UI.ReferenceFacet',
    ID    : 'DadosReembolso',
    Label : 'Reembolso',
    Target: '@UI.FieldGroup#Reembolso'
  }],
  UI.FieldGroup #Reembolso : {Data: [
    {
      $Type         : 'UI.DataFieldWithIntentBasedNavigation',
      Value         : numeroPedido,
      SemanticObject: 'PedidoCompra',
      Action        : 'manage'
    },
    {Value: nomeCliente},
    {Value: cpfCliente},
    {
      Value      : statusReembolso_code,
      Criticality: statusReembolso.criticality
    },
    {Value: statusPedidoAnterior_code},
    {Value: valorReembolso},
    {Value: motivoSolicitacao},
    {Value: dataSolicitacao},
    {Value: solicitadoPor},
    {Value: motivoDecisao},
    {Value: dataDecisao},
    {Value: decididoPor}
  ]}
) {
  // Cliente e CPF abrem o cliente na Gestão de Clientes (chave semântica: cpf)
  nomeCliente          @title: 'Cliente'  @Common: {
    SemanticObject       : 'Cliente',
    SemanticObjectMapping: [{
      LocalProperty         : cpfCliente,
      SemanticObjectProperty: 'cpf'
    }]
  };
  cpfCliente           @title: 'CPF'  @Common: {
    Text                 : cpfClienteFormatado,
    TextArrangement      : #TextOnly,
    SemanticObject       : 'Cliente',
    SemanticObjectMapping: [{
      LocalProperty         : cpfCliente,
      SemanticObjectProperty: 'cpf'
    }]
  };
  cpfClienteFormatado  @title: 'CPF';
  statusReembolso      @Common.ValueListWithFixedValues;
  statusPedidoAnterior @Common.ValueListWithFixedValues;
};

annotate service.Reembolsos actions {
  aprovarReembolso(
    motivoDecisao @title: 'Motivo da decisão (opcional)'  @UI.MultiLineText
  );
  rejeitarReembolso(
    motivoDecisao @title: 'Motivo da decisão'  @UI.MultiLineText
  );
};
