/*
 * UI da aplicação Gestão de Estoque (porte de ZC_PC_ITEM_APP.ddlx).
 */
using EstoqueService as service from '../../srv/estoque-service';

annotate service.Itens with @(
  Common.SemanticKey         : [sku],
  UI.HeaderInfo              : {
    TypeName      : 'Item',
    TypeNamePlural: 'Itens de estoque',
    Title         : {Value: nome},
    Description   : {Value: sku},
    ImageUrl      : fotoItem,
    TypeImageUrl  : 'sap-icon://product'
  },
  UI.SelectionFields         : [
    sku,
    nome,
    categoria_code,
    statusEstoque_code,
    itemAtivo,
    qtdeDisponivel
  ],
  UI.LineItem                : [
    {
      Value: fotoItem,
      Label: 'Foto'
    },
    {
      Value            : sku,
      ![@UI.Importance]: #High
    },
    {
      Value            : nome,
      ![@UI.Importance]: #High
    },
    {Value: categoria_code},
    {
      Value: qtdeEstoque,
      Label: 'Qtde estoque'
    },
    {
      Value: qtdeReservada,
      Label: 'Qtde reservada'
    },
    {
      Value            : qtdeDisponivel,
      Label            : 'Qtde disponível',
      ![@UI.Importance]: #High
    },
    {
      Value            : statusEstoque_code,
      Criticality      : statusEstoque.criticality,
      ![@UI.Importance]: #High
    },
    {Value: precoUnitario},
    {
      Value: itemAtivo,
      Label: 'Ativo'
    }
  ],
  UI.PresentationVariant     : {
    SortOrder     : [{Property: nome}],
    Visualizations: ['@UI.LineItem']
  },
  UI.HeaderFacets            : [{
    $Type : 'UI.ReferenceFacet',
    ID    : 'HeaderEstoque',
    Target: '@UI.DataPoint#Status'
  }],
  UI.DataPoint #Status       : {
    Value      : statusEstoque_code,
    Title      : 'Status',
    Criticality: statusEstoque.criticality
  },
  UI.Facets                  : [
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'DadosItem',
      Label : 'Dados do item',
      Target: '@UI.FieldGroup#Dados'
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'Estoque',
      Label : 'Estoque',
      Target: '@UI.FieldGroup#Estoque'
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'Administrativo',
      Label : 'Dados administrativos',
      Target: '@UI.FieldGroup#Admin'
    }
  ],
  UI.FieldGroup #Dados       : {Data: [
    {Value: fotoItem},
    {
      Value: sku,
      Label: 'SKU (gerado automaticamente)'
    },
    {Value: nome},
    {Value: descricao},
    {Value: categoria_code},
    {Value: precoUnitario},
    {Value: currency_code},
    {Value: itemAtivo}
  ]},
  UI.FieldGroup #Estoque     : {Data: [
    {Value: qtdeEstoque},
    {Value: qtdeReservada},
    {Value: qtdeDisponivel},
    {
      Value      : statusEstoque_code,
      Criticality: statusEstoque.criticality
    }
  ]},
  UI.FieldGroup #Admin       : {Data: [
    {Value: createdAt},
    {Value: createdBy},
    {Value: modifiedAt},
    {Value: modifiedBy}
  ]},
  Common.SideEffects #Estoque: {
    SourceProperties: [qtdeEstoque],
    TargetProperties: [
      'qtdeDisponivel',
      'statusEstoque_code'
    ]
  }
) {
  statusEstoque_code @title: 'Status'  @Common: {
    Text                    : statusEstoque.name,
    TextArrangement         : #TextOnly,
    ValueListWithFixedValues: true,
    ValueList               : {
      CollectionPath: 'StatusEstoque',
      Parameters    : [{
        $Type            : 'Common.ValueListParameterInOut',
        LocalDataProperty: statusEstoque_code,
        ValueListProperty: 'code'
      }]
    }
  };
  currency           @Common.ValueList: {
    CollectionPath: 'Currencies',
    Parameters    : [
      {
        $Type            : 'Common.ValueListParameterInOut',
        LocalDataProperty: currency_code,
        ValueListProperty: 'code'
      },
      {
        $Type            : 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'name'
      }
    ]
  };
};
