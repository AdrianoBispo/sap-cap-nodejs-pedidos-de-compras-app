using {pedidoscompras as db} from '../db/schema';

/**
 * Camada analítica somente leitura.
 *
 * Cada entidade é uma visão por domínio (pedidos, clientes, itens de estoque
 * e reembolsos) com dimensões e medidas. As medidas
 * têm agregação padrão (@Aggregation.default) e são expostas como "custom
 * aggregates", então o cliente usa $apply=groupby((dimensão),aggregate(medida))
 * sem informar o método. Usada pelos apps freestyle de análise (app/analise-pedidos,
 * app/analise-clientes, app/analise-estoque e app/analise-reembolsos), um por visão.
 */
@path    : 'analitico'
@requires: [
  'Comum',
  'Admin'
]
service AnaliticoService {

  @Aggregation.ApplySupported: {
    Transformations       : ['aggregate', 'groupby', 'filter', 'orderby', 'top', 'skip', 'concat'],
    Rollup                : #None,
    PropertyRestrictions  : true,
    GroupableProperties   : [numeroPedido, statusPedido, statusPagamento, uf, mesCriacao, currency],
    AggregatableProperties: [{Property: valorTotal}, {Property: valorMedio}, {Property: qtdePedidos}]
  }
  @Aggregation.CustomAggregate #valorTotal : 'Edm.Decimal'
  @Aggregation.CustomAggregate #valorMedio : 'Edm.Decimal'
  @Aggregation.CustomAggregate #qtdePedidos: 'Edm.Int32'
  @readonly
  entity PedidosAnalise    as
    select from db.Pedidos {
      key ID,
          numeroPedido,
          @Common.Text: statusPedidoTexto  @Common.TextArrangement: #TextOnly
          statusPedido.code                           as statusPedido      : String(40),
          statusPedido.name                           as statusPedidoTexto : String(255),
          @Common.Text: statusPagamentoTexto  @Common.TextArrangement: #TextOnly
          statusPagamento.code                        as statusPagamento      : String(30),
          statusPagamento.name                        as statusPagamentoTexto : String(255),
          cliente.ID                                  as clienteID,
          cliente.enderecoPrincipal.uf                as uf                : String(2),
          cast(year(createdAt) * 100 + month(createdAt) as String(6)) as mesCriacao : String(6),
          currency.code                               as currency          : String(3),
          @Aggregation.default: #SUM  @Measures.ISOCurrency: currency
          valorTotal,
          @Aggregation.default: #AVG  @Measures.ISOCurrency: currency
          valorTotal                                  as valorMedio        : Decimal(15, 2),
          @Aggregation.default: #SUM
          1                                           as qtdePedidos       : Integer
    };

  @Aggregation.ApplySupported: {
    Transformations       : ['aggregate', 'groupby', 'filter', 'orderby', 'top', 'skip', 'concat'],
    Rollup                : #None,
    PropertyRestrictions  : true,
    GroupableProperties   : [nome, genero, clienteAtivo, uf, faixaScore, mesCadastro],
    AggregatableProperties: [{Property: qtdeClientes}, {Property: scoreMedio}]
  }
  @Aggregation.CustomAggregate #qtdeClientes: 'Edm.Int32'
  @Aggregation.CustomAggregate #scoreMedio  : 'Edm.Decimal'
  @readonly
  entity ClientesAnalise   as
    select from db.Clientes {
      key ID,
          nome,
          @Common.Text: generoTexto  @Common.TextArrangement: #TextOnly
          genero.code                                 as genero       : String(30),
          genero.name                                 as generoTexto  : String(255),
          clienteAtivo,
          enderecoPrincipal.uf                        as uf           : String(2),
          /** BAIXO (até 40), MEDIO (até 70) ou ALTO (acima de 70). */
          case
            when scoreCliente < 40  then 'BAIXO'
            when scoreCliente <= 70 then 'MEDIO'
            else 'ALTO'
          end                                         as faixaScore   : String(5),
          cast(year(createdAt) * 100 + month(createdAt) as String(6)) as mesCadastro : String(6),
          @Aggregation.default: #SUM
          1                                           as qtdeClientes : Integer,
          @Aggregation.default: #AVG
          scoreCliente                                as scoreMedio   : Decimal(5, 2)
    };

  @Aggregation.ApplySupported: {
    Transformations       : ['aggregate', 'groupby', 'filter', 'orderby', 'top', 'skip', 'concat'],
    Rollup                : #None,
    PropertyRestrictions  : true,
    GroupableProperties   : [sku, nome, categoria, statusEstoque, itemAtivo, currency],
    AggregatableProperties: [
      {Property: qtdeEstoque},
      {Property: qtdeReservada},
      {Property: qtdeDisponivel},
      {Property: valorEstoque},
      {Property: qtdeItens}
    ]
  }
  @Aggregation.CustomAggregate #qtdeEstoque   : 'Edm.Int32'
  @Aggregation.CustomAggregate #qtdeReservada : 'Edm.Int32'
  @Aggregation.CustomAggregate #qtdeDisponivel: 'Edm.Int32'
  @Aggregation.CustomAggregate #valorEstoque  : 'Edm.Decimal'
  @Aggregation.CustomAggregate #qtdeItens     : 'Edm.Int32'
  @readonly
  entity ItensAnalise      as
    select from db.Itens {
      key ID,
          sku,
          nome,
          @Common.Text: categoriaTexto  @Common.TextArrangement: #TextOnly
          categoria.code                              as categoria          : String(30),
          categoria.name                              as categoriaTexto     : String(255),
          @Common.Text: statusEstoqueTexto  @Common.TextArrangement: #TextOnly
          statusEstoque_code                          as statusEstoque      : String(30),
          statusEstoque.name                          as statusEstoqueTexto : String(255),
          itemAtivo,
          currency.code                               as currency           : String(3),
          @Aggregation.default: #SUM
          qtdeEstoque,
          @Aggregation.default: #SUM
          qtdeReservada,
          @Aggregation.default: #SUM
          qtdeDisponivel,
          /** Valor do estoque físico: preço unitário x quantidade em estoque. */
          @Aggregation.default: #SUM
          cast(precoUnitario * qtdeEstoque as Decimal(17, 2)) as valorEstoque : Decimal(17, 2),
          @Aggregation.default: #SUM
          1                                           as qtdeItens          : Integer
    };

  @Aggregation.ApplySupported: {
    Transformations       : ['aggregate', 'groupby', 'filter', 'orderby', 'top', 'skip', 'concat'],
    Rollup                : #None,
    PropertyRestrictions  : true,
    GroupableProperties   : [numeroPedido, statusReembolso, motivoSolicitacao, uf, mesSolicitacao, currency],
    AggregatableProperties: [{Property: valorReembolso}, {Property: qtdeReembolsos}]
  }
  @Aggregation.CustomAggregate #valorReembolso: 'Edm.Decimal'
  @Aggregation.CustomAggregate #qtdeReembolsos: 'Edm.Int32'
  @readonly
  entity ReembolsosAnalise as
    select from db.Reembolsos {
      key ID,
          numeroPedido,
          @Common.Text: statusReembolsoTexto  @Common.TextArrangement: #TextOnly
          statusReembolso.code                        as statusReembolso      : String(20),
          statusReembolso.name                        as statusReembolsoTexto : String(255),
          motivoSolicitacao,
          cliente.enderecoPrincipal.uf                as uf                   : String(2),
          cast(year(dataSolicitacao) * 100 + month(dataSolicitacao) as String(6)) as mesSolicitacao : String(6),
          currency.code                               as currency             : String(3),
          @Aggregation.default: #SUM  @Measures.ISOCurrency: currency
          valorReembolso,
          @Aggregation.default: #SUM
          1                                           as qtdeReembolsos       : Integer
    };
}
