using {pedidoscompras as db} from '../db/schema';
using {pedidoscompras.ResultadoImportacao} from './common';

/**
 * Aplicação Gestão de Clientes (equivalente ao serviço ZUI_PC_CLIENTES).
 * Clientes e endereços com rascunho; apenas administradores alteram.
 */
@path    : 'clientes'
@requires: 'authenticated-user'
service ClientesService {

  @odata.draft.enabled
  @restrict: [
    {
      grant: 'READ',
      to   : 'Comum'
    },
    {
      grant: '*',
      to   : 'Admin'
    }
  ]
  entity Clientes        as projection on db.Clientes {
    *,
    enderecoPrincipal.cidade as cidadePrincipal,
    enderecoPrincipal.uf     as ufPrincipal
  }
    excluding {
      pedidos
    };

  @restrict: [
    {
      grant: 'READ',
      to   : 'Comum'
    },
    {
      grant: '*',
      to   : 'Admin'
    }
  ]
  @cds.redirection.target
  entity Enderecos       as projection on db.Enderecos
    actions {
      /** Define o endereço como principal e desmarca os demais do cliente. */
      action definirEnderecoPrincipal() returns Enderecos;
    };

  @readonly
  entity Generos         as projection on db.Generos;

  /**
   * CEPs já validados no cadastro (um registro por CEP, sem CEP geral), como
   * a value help ZC_PC_CEP_VH: escolher um deles evita nova chamada ao ViaCEP.
   */
  @readonly
  entity CepsCadastrados as
    select from db.Enderecos {
      key cep,
          max(logradouro) as logradouro : String(150),
          max(bairro)     as bairro     : String(100),
          max(cidade)     as cidade     : String(100),
          max(uf)         as uf         : String(2),
          max(estado)     as estado     : String(100),
          count(*)        as qtdeEnderecos : Integer
    }
    where
          cepStatus = 'V'
      and cepGeral  = false
    group by
      cep;

  /**
   * Importação em massa por planilha (.xlsx ou .csv): um cliente por linha,
   * com o endereço principal. Tudo ou nada.
   */
  @requires: 'Admin'
  action importarPlanilha(arquivo : LargeBinary not null, nomeArquivo : String(255)) returns ResultadoImportacao;
}
