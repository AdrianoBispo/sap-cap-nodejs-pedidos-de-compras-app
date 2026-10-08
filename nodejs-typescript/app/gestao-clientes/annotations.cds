/*
 * UI da aplicação Gestão de Clientes (porte de ZC_PC_CLIENTE_APP.ddlx e
 * ZC_PC_ENDERECO_APP.ddlx).
 */
using ClientesService as service from '../../srv/clientes-service';

annotate service.Clientes with @(
  Common.SemanticKey     : [cpf],
  UI.HeaderInfo          : {
    TypeName      : 'Cliente',
    TypeNamePlural: 'Clientes',
    Title         : {Value: nome},
    Description   : {Value: cpfFormatado},
    ImageUrl      : fotoCliente,
    TypeImageUrl  : 'sap-icon://person-placeholder'
  },
  UI.SelectionFields     : [
    nome,
    cpf,
    email,
    clienteAtivo,
    cidadePrincipal,
    ufPrincipal
  ],
  UI.LineItem            : [
    {
      Value: fotoCliente,
      Label: 'Foto'
    },
    {
      Value            : cpfFormatado,
      ![@UI.Importance]: #High
    },
    {
      Value            : nome,
      Label            : 'Nome',
      ![@UI.Importance]: #High
    },
    {Value: email},
    {Value: telefoneFormatado},
    {
      Value            : clienteAtivo,
      Label            : 'Ativo',
      ![@UI.Importance]: #High
    },
    {Value: cidadePrincipal},
    {Value: ufPrincipal},
    {
      Value: createdAt,
      Label: 'Data de cadastro'
    }
  ],
  UI.PresentationVariant : {
    SortOrder     : [{Property: nome}],
    Visualizations: ['@UI.LineItem']
  },
  UI.HeaderFacets        : [{
    $Type : 'UI.ReferenceFacet',
    ID    : 'HeaderScore',
    Target: '@UI.DataPoint#Score'
  }],
  // Score de 0 a 100 em %: barra vermelha (até 40), amarela (até 70) e verde
  UI.DataPoint #Score    : {
    Value        : scoreCliente,
    Title        : 'Score do cliente',
    TargetValue  : 100,
    Visualization: #Progress,
    Criticality  : scoreCriticality
  },
  UI.Facets              : [
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'DadosCliente',
      Label : 'Dados do cliente',
      Target: '@UI.FieldGroup#Dados'
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'Enderecos',
      Label : 'Endereços',
      Target: 'enderecos/@UI.LineItem'
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'Administrativo',
      Label : 'Dados administrativos',
      Target: '@UI.FieldGroup#Admin'
    }
  ],
  UI.FieldGroup #Dados   : {Data: [
    {Value: fotoCliente},
    {Value: cpf},
    {Value: nome},
    {Value: email},
    {Value: telefone},
    {Value: genero_code},
    {Value: dataNascimento},
    {Value: clienteAtivo}
  ]},
  UI.FieldGroup #Admin   : {Data: [
    {Value: createdAt},
    {Value: createdBy},
    {Value: modifiedAt},
    {Value: modifiedBy}
  ]}
) {
  cidadePrincipal @title: 'Cidade';
  ufPrincipal     @title: 'UF';
};

annotate service.Enderecos with @(
  UI.HeaderInfo            : {
    TypeName      : 'Endereço',
    TypeNamePlural: 'Endereços',
    Title         : {Value: logradouro},
    Description   : {Value: cidade}
  },
  UI.LineItem              : [
    {
      $Type : 'UI.DataFieldForAction',
      Action: 'ClientesService.definirEnderecoPrincipal',
      Label : 'Definir como principal'
    },
    {
      Value            : cepFormatado,
      ![@UI.Importance]: #High
    },
    {
      Value            : logradouro,
      ![@UI.Importance]: #High
    },
    {
      Value            : numero,
      ![@UI.Importance]: #High
    },
    {Value: complemento},
    {Value: bairro},
    {Value: cidade},
    {Value: uf},
    {
      Value            : principal,
      Label            : 'Principal',
      ![@UI.Importance]: #High
    }
  ],
  UI.PresentationVariant   : {
    SortOrder     : [{
      Property  : principal,
      Descending: true
    }],
    Visualizations: ['@UI.LineItem']
  },
  UI.Identification        : [{
    $Type : 'UI.DataFieldForAction',
    Action: 'ClientesService.definirEnderecoPrincipal',
    Label : 'Definir como principal'
  }],
  UI.Facets                : [{
    $Type : 'UI.ReferenceFacet',
    ID    : 'DadosEndereco',
    Label : 'Endereço',
    Target: '@UI.FieldGroup#Endereco'
  }],
  UI.FieldGroup #Endereco  : {Data: [
    {Value: cep},
    {Value: logradouro},
    {Value: numero},
    {Value: complemento},
    {Value: bairro},
    {Value: cidade},
    {Value: uf},
    {Value: estado},
    {Value: principal}
  ]},
  // CEP informado: o backend consulta o ViaCEP e a UI recarrega o endereço
  Common.SideEffects #Cep  : {
    SourceProperties: [cep],
    TargetProperties: [
      'logradouro',
      'bairro',
      'cidade',
      'uf',
      'estado',
      'cepGeral',
      'cepStatus',
      'controleCampoCep',
      'cepFormatado',
      'enderecoCompleto'
    ]
  }
) {
  // Logradouro e bairro vêm do ViaCEP; editáveis só para CEP geral de município
  logradouro @Common.FieldControl: controleCampoCep;
  bairro     @Common.FieldControl: controleCampoCep;
  cep        @Common.ValueList   : {
    $Type         : 'Common.ValueListType',
    Label         : 'CEPs já cadastrados',
    CollectionPath: 'CepsCadastrados',
    Parameters    : [
      {
        $Type            : 'Common.ValueListParameterInOut',
        LocalDataProperty: cep,
        ValueListProperty: 'cep'
      },
      {
        $Type            : 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'logradouro'
      },
      {
        $Type            : 'Common.ValueListParameterDisplayOnly',
        ValueListProperty: 'bairro'
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
  };
};

annotate service.Enderecos actions {
  // Disponível só para endereço que ainda não é o principal
  definirEnderecoPrincipal @(
    Core.OperationAvailable: ($self.principal = false),
    Common.SideEffects     : {TargetEntities: [in.cliente.enderecos]}
  );
};

annotate service.CepsCadastrados with {
  cep           @title: 'CEP';
  logradouro    @title: 'Logradouro';
  bairro        @title: 'Bairro';
  cidade        @title: 'Cidade';
  uf            @title: 'UF';
  estado        @title: 'Estado';
  qtdeEnderecos @title: 'Endereços com este CEP';
};
