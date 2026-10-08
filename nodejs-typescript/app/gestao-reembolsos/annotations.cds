/*
 * UI da aplicação Gestão de Reembolsos (porte de ZC_PC_REEMBOLSO_APP.ddlx).
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
      Value            : numeroPedido,
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
    Visualizations: ['@UI.LineItem']
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
    {Value: numeroPedido},
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
  nomeCliente          @title: 'Cliente'  @Common.SemanticObject: 'Cliente';
  cpfCliente           @title: 'CPF';
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
