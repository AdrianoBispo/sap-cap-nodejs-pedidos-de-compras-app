# Gestão de Reembolsos

App **SAP Fiori Elements** (OData V4, List Report + Object Page) para aprovar ou rejeitar as
solicitações de reembolso de pedidos cancelados com pagamento aprovado.

| | |
| --- | --- |
| Serviço | `ReembolsosService` (`/odata/v4/reembolsos`), entidade `Reembolsos` |
| `sap.app.id` | `gestaoreembolsos` |
| Tile (inbound) | `Reembolso-manage` |
| URL local | `http://localhost:4004/gestaoreembolsos/index.html` |
| Perfis | `Admin` e `Comum` |

## Páginas

- **Lista de reembolsos**: pedido, cliente, status e valor; filtros por número do pedido, cliente e
  status; ações **Aprovar** e **Rejeitar**. Não há criar, editar nem excluir: as solicitações são
  abertas pela app Pedidos de Compras, ao cancelar um pedido já pago.
- **Reembolso**: pedido, cliente, CPF, status, status anterior do pedido, valor, motivo, datas e
  responsáveis da solicitação e da decisão; ações **Aprovar reembolso** e **Rejeitar reembolso**.

As duas ações só ficam disponíveis com o reembolso `PENDENTE` (`Core.OperationAvailable`):

- **Aprovar** cancela o pedido, libera a reserva de estoque, gera os snapshots e marca o pagamento
  como `DEVOLVIDO`;
- **Rejeitar** exige o motivo e devolve o pedido ao status anterior.

**Navegação**: o Pedido é um link direto para a app Pedidos de Compras; Cliente e CPF abrem a Gestão
de Clientes.

| Lista | Aprovação |
| :---: | :---: |
| <img src="../../../assets/reembolsos/reembolsos.png" alt="Lista de reembolsos" width="440"> | <img src="../../../assets/reembolsos/fluxo-reembolso-02-aprovar.png" alt="Aprovação de um reembolso" width="440"> |

## Executar

Na raiz da implementação: `npm run watch` e abra a URL local acima, ou o tile no
`http://localhost:4004/launchpad.html` (necessário para os links de navegação).

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `annotations.cds` | Colunas, filtros, seção *Reembolso*, ações e disponibilidade (`OperationAvailable`) |
| `webapp/manifest.json` | Rotas, tabela, tile |
| `webapp/test/integration/` | Testes OPA5 gerados pelo Fiori tools |

Visão geral das apps: [`../README.md`](../README.md).

<details>
<summary>Dados da geração (SAP Fiori tools)</summary>

|               |
| ------------- |
|**Generation Date and Time**<br>Thu Oct 08 2026 08:54:21 GMT-0300 (Horário Padrão de Brasília)|
|**App Generator**<br>SAP Fiori Application Generator|
|**App Generator Version**<br>1.28.0|
|**Generation Platform**<br>CLI|
|**Template Used**<br>List Report Page V4|
|**Service Type**<br>Local CAP|
|**Service URL**<br>http://localhost:4004/odata/v4/reembolsos/|
|**Module Name**<br>gestao-reembolsos|
|**Application Title**<br>Gestão de Reembolsos|
|**Namespace**<br>|
|**UI5 Theme**<br>sap_horizon|
|**UI5 Version**<br>1.148.12|
|**Enable TypeScript**<br>False|
|**Add Eslint configuration**<br>True, see https://www.npmjs.com/package/@sap-ux/eslint-plugin-fiori-tools#rules for the eslint rules.|
|**Main Entity**<br>Reembolsos|

</details>
