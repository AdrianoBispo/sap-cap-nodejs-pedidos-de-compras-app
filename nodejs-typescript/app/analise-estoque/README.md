# Análise de Itens do Estoque

App **SAPUI5 freestyle** (OData V4, somente leitura) com as análises do estoque: 5 cenários de
gráfico sobre a entidade `ItensAnalise` do `AnaliticoService` (`/odata/v4/analitico`).

| | |
| --- | --- |
| `sap.app.id` | `analiseestoque` |
| Tile (inbound) | `AnaliseEstoque-display` |
| URL local | `http://localhost:4004/analiseestoque/index.html` |
| Abrir gestão | Gestão de Estoque (`ItemEstoque-manage`) |

- **Painel** (`#/`): filtros (categoria, situação do estoque, nome e SKU), indicadores (itens, em
  estoque, reservada, disponível e valor em estoque) e os 5 gráficos.
- **Detalhe** (`#/analise/<cenário>`): gráfico com troca de tipo, tabela de valores e % do total.

| Cenário (id) | Análise | Gráfico |
| --- | --- | --- |
| `EstDisponivelPorCategoria` | Estoque por categoria (reservada e disponível) | Colunas |
| `EstItensPorSituacao` | Itens por situação do estoque | Rosca |
| `EstValorPorCategoria` | Valor em estoque por categoria | Colunas |
| `EstMaisReservados` | Itens mais reservados (top 10) | Colunas |
| `EstItensPorCategoria` | Itens por categoria | Rosca |

<p align="center">
  <img src="../../../assets/analises/analise-estoque.png" alt="Painel da Análise de Itens do Estoque" width="700">
</p>

## Executar e testar

Na raiz da implementação: `npm run watch` e abra a URL local acima, ou o tile no
`http://localhost:4004/launchpad.html`. A suíte QUnit (catálogo e consultas `$apply`) abre em
`http://localhost:4004/analiseestoque/test/testsuite.qunit.html`.

Estrutura, motor comum e como incluir um cenário: veja
[`../README.md`](../README.md#apps-de-análise-freestyle).
