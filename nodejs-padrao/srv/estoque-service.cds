using {pedidoscompras as db} from '../db/schema';
using {
  pedidoscompras.ResultadoImportacao,
  pedidoscompras.Permissoes as AspectoPermissoes
} from './common';

/**
 * Aplicação Gestão de Estoque.
 * Reserva, liberação e baixa NÃO são expostas: só o domínio de pedidos
 * movimenta o estoque (srv/lib/estoque).
 */
@path    : 'estoque'
@requires: 'authenticated-user'
service EstoqueService {

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
  entity Itens         as projection on db.Itens;

  @readonly
  entity Categorias    as projection on db.Categorias;

  @readonly
  entity StatusEstoque as projection on db.StatusEstoque;

  /** Permissões do usuário logado (calculadas no handler a partir dos papéis). */
  @odata.singleton
  @readonly
  @cds.persistence.skip
  entity Permissoes : AspectoPermissoes {}

  /** Importação em massa por planilha (.xlsx ou .csv). Tudo ou nada. */
  @requires: 'Admin'
  action importarPlanilha(arquivo : LargeBinary not null, nomeArquivo : String(255)) returns ResultadoImportacao;
}
