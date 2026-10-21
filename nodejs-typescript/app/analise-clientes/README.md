# Análise de Clientes

App **SAPUI5 freestyle** (OData V4, somente leitura) com as análises dos clientes: 5 cenários de
gráfico sobre a entidade `ClientesAnalise` do `AnaliticoService` (`/odata/v4/analitico`).

| | |
| --- | --- |
| `sap.app.id` | `analiseclientes` |
| Tile (inbound) | `AnaliseClientes-display` |
| URL local | `http://localhost:4004/analiseclientes/index.html` |
| Abrir gestão | Gestão de Clientes (`Cliente-manage`) |

- **Painel** (`#/`): filtros (gênero, cliente ativo, UF, faixa do score e nome), indicadores
  (clientes e score médio) e os 5 gráficos.
- **Detalhe** (`#/analise/<cenário>`): gráfico com troca de tipo, tabela de valores e % do total.

| Cenário (id) | Análise | Gráfico |
| --- | --- | --- |
| `CliPorGenero` | Clientes por gênero | Rosca |
| `CliPorUf` | Clientes por UF | Colunas |
| `CliPorFaixaScore` | Clientes por faixa de score | Rosca |
| `CliCadastrosPorMes` | Cadastros de clientes por mês | Colunas |
| `CliScorePorUf` | Score médio por UF | Colunas |

<p align="center">
  <img src="../../../assets/analises/analise-clientes.png" alt="Painel da Análise de Clientes" width="700">
</p>

## Executar e testar

Na raiz da implementação: `npm run watch` e abra a URL local acima, ou o tile no
`http://localhost:4004/launchpad.html`. A suíte QUnit (catálogo e consultas `$apply`) abre em
`http://localhost:4004/analiseclientes/test/testsuite.qunit.html`.

Estrutura, motor comum e como incluir um cenário: veja
[`../README.md`](../README.md#apps-de-análise-freestyle).
