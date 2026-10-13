/*
 * Nomes das classes geradas pelo cds-typer (@cds-models) para os handlers em
 * TypeScript. Por padrão o singular é obtido removendo o "s" final do nome da
 * entidade, o que não funciona para os plurais em português terminados em
 * "ens", "ões" ou já no singular. As anotações não alteram o modelo OData nem
 * o banco: só os nomes dos tipos TypeScript.
 */
using {pedidoscompras as db} from '../db/schema';
using {pedidoscompras.Numeracoes} from '../db/common';
using {ClientesService} from './clientes-service';
using {EstoqueService} from './estoque-service';
using {PedidosService} from './pedidos-service';

annotate db.Itens with @singular: 'Item';
annotate db.ItensPedido with @singular: 'ItemPedido';
annotate Numeracoes with @singular: 'Numeracao';
// As anotações não são herdadas pelas projeções: cada serviço declara as suas.
annotate EstoqueService.Itens with @singular: 'Item';
annotate ClientesService.CepsCadastrados with @singular: 'CepCadastrado';
annotate PedidosService.ClientesAtivos with @singular: 'ClienteAtivo';
annotate PedidosService.ItensAtivos with @singular: 'ItemAtivo';
annotate PedidosService.ItensPedido with @singular: 'ItemPedido';
annotate PedidosService.Itens with @singular: 'Item';
annotate ClientesService.Permissoes with @singular: 'Permissao';
annotate EstoqueService.Permissoes with @singular: 'Permissao';
