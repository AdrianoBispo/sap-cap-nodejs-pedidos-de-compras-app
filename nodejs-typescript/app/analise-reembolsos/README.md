# Análise de Pedidos de Reembolsos

App **SAPUI5 freestyle** (OData V4, somente leitura) com as análises dos reembolsos: 5 cenários de
gráfico sobre a entidade `ReembolsosAnalise` do `AnaliticoService` (`/odata/v4/analitico`).

| | |
| --- | --- |
| `sap.app.id` | `analisereembolsos` |
| Tile (inbound) | `AnaliseReembolsos-display` |
| URL local | `http://localhost:4004/analisereembolsos/index.html` |
| Abrir gestão | Gestão de Reembolsos (`Reembolso-manage`) |

- **Painel** (`#/`): filtros (status do reembolso, UF e mês da solicitação), indicadores
  (reembolsos e valor dos reembolsos) e os 5 gráficos.
- **Detalhe** (`#/analise/<cenário>`): gráfico com troca de tipo, tabela de valores e % do total.

| Cenário (id) | Análise | Gráfico |
| --- | --- | --- |
| `ReeValorPorStatus` | Valor dos reembolsos por status | Colunas |
| `ReeQtdePorStatus` | Reembolsos por status | Rosca |
| `ReeValorPorMes` | Valor dos reembolsos por mês | Colunas |
| `ReeValorPorUf` | Valor dos reembolsos por UF | Colunas |
| `ReePorMotivo` | Reembolsos por motivo da solicitação | Colunas |

<p align="center">
  <img src="../../../assets/analises/analise-reembolsos.png" alt="Painel da Análise de Pedidos de Reembolsos" width="700">
</p>

## Executar e testar

Na raiz da implementação: `npm run watch` e abra a URL local acima, ou o tile no
`http://localhost:4004/launchpad.html`. A suíte QUnit (catálogo e consultas `$apply`) abre em
`http://localhost:4004/analisereembolsos/test/testsuite.qunit.html`.

Estrutura, motor comum e como incluir um cenário: veja
[`../README.md`](../README.md#apps-de-análise-freestyle).
