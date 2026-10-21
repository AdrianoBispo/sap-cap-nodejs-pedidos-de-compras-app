# Análise de Pedidos de Compras

App **SAPUI5 freestyle** (OData V4, somente leitura) com as análises dos pedidos: 5 cenários de
gráfico sobre a entidade `PedidosAnalise` do `AnaliticoService` (`/odata/v4/analitico`).

| | |
| --- | --- |
| `sap.app.id` | `analisepedidos` |
| Tile (inbound) | `AnalisePedidos-display` |
| URL local | `http://localhost:4004/analisepedidos/index.html` |
| Abrir gestão | Pedidos de Compras (`PedidoCompra-manage`) |

- **Painel** (`#/`): filtros (status do pedido, status do pagamento, UF e mês de criação),
  indicadores (valor total, pedidos e ticket médio) e os 5 gráficos.
- **Detalhe** (`#/analise/<cenário>`): gráfico com troca de tipo, tabela de valores e % do total.

| Cenário (id) | Análise | Gráfico |
| --- | --- | --- |
| `PedValorPorStatus` | Valor por status do pedido | Colunas |
| `PedPorMes` | Pedidos por mês | Colunas |
| `PedValorPorUf` | Valor dos pedidos por UF | Colunas |
| `PedPorPagamento` | Pedidos por status do pagamento | Rosca |
| `PedTicketMedio` | Ticket médio por status do pedido | Colunas |

<p align="center">
  <img src="../../../assets/analises/analise-pedidos.png" alt="Painel da Análise de Pedidos de Compras" width="700">
</p>

## Executar e testar

Na raiz da implementação: `npm run watch` e abra a URL local acima, ou o tile no
`http://localhost:4004/launchpad.html`. A suíte QUnit (catálogo e consultas `$apply`) abre em
`http://localhost:4004/analisepedidos/test/testsuite.qunit.html`.

Estrutura, motor comum e como incluir um cenário: veja
[`../README.md`](../README.md#apps-de-análise-freestyle).
