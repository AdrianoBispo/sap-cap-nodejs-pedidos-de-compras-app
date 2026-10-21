# Pedidos de Compras

App **SAP Fiori Elements** (OData V4, List Report + Object Page) para registrar pedidos, reservar o
estoque, efetuar o pagamento simulado, aprovar e cancelar.

| | |
| --- | --- |
| Serviço | `PedidosService` (`/odata/v4/pedidos`), entidade `Pedidos` |
| `sap.app.id` | `pedidoscompras` |
| Tile (inbound) | `PedidoCompra-manage` |
| URL local | `http://localhost:4004/pedidoscompras/index.html` |
| Perfis | `Admin` e `Comum` |

## Páginas

- **Lista de pedidos**: filtros por cliente, CPF, status do pedido e do pagamento, data e valor;
  ação **Importar planilha** e o menu **Ações** (*Efetuar Pagamento*, *Aprovar pedido*, *Cancelar
  pedido*), visível só com um pedido não encerrado selecionado (`webapp/ext/AcoesPedido.js`).
- **Pedido**: seções *Dados do Cliente*, *Dados do Pedido*, *Itens*, *Pagamento (última tentativa)*
  e, conforme o status, *Finalização* ou *Cancelamento*. Em pedidos `FINALIZADO` ou `CANCELADO`,
  cliente e itens vêm dos **snapshots**.
- **Item do pedido** e **Item no encerramento** (snapshot): sub-páginas com os dados do item.

Como o pedido funciona na tela:

1. **Criar** abre o rascunho: o usuário informa só o *Cliente* e os itens, criados na própria tabela
   (*inline*). Endereço, preços, totais, número e status vêm do backend.
2. **Salvar** registra o pedido (`ABERTO`) e reserva o estoque. Em `ABERTO`, *Editar* permite mudar
   só os itens, e a reserva é ajustada pela diferença. O pedido não tem *Excluir*.
3. **Efetuar Pagamento** abre um diálogo próprio (`webapp/ext/EfetuarPagamento.js`) com
   `sap.m.MaskInput` no cartão (`9999 9999 9999 9999`), na validade (`MM/AA`) e no CVV (`999`). O
   botão só habilita com os campos completos e o mês entre 01 e 12; a chamada é a action vinculada
   pelo `editFlow`, e o backend continua validando tudo.
4. **Aprovar pedido** finaliza o pedido e dá baixa no estoque; **Cancelar pedido** pede o motivo e,
   se o pagamento já foi aprovado, abre uma solicitação na app Gestão de Reembolsos.

**Navegação**: Cliente e CPF abrem a Gestão de Clientes; Item e SKU, a Gestão de Estoque; o link
*Solicitação de reembolso* abre o reembolso do pedido.

**Para testar o pagamento**: cartão `4111 1111 1111 1111`, validade futura e CVV `123` aprovam; CVV
`000` recusa.

| Object Page do pedido | Efetuar Pagamento |
| :---: | :---: |
| <img src="../../../assets/pedidos/pedido-object-page.png" alt="Object Page de um pedido finalizado" width="440"> | <img src="../../../assets/pedidos/pagamento-mascara.png" alt="Diálogo Efetuar Pagamento com máscara" width="440"> |

## Executar

Na raiz da implementação: `npm run watch` e abra a URL local acima, ou o tile no
`http://localhost:4004/launchpad.html` (necessário para os links de navegação).

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `annotations.cds` | Colunas, filtros, seções dinâmicas, grupo *Ações*, objetos semânticos |
| `webapp/manifest.json` | Rotas Pedido → Item / Item no encerramento, tabela *inline*, ações customizadas, tile |
| `webapp/ext/EfetuarPagamento.js` | Diálogo de pagamento com máscara de digitação |
| `webapp/ext/AcoesPedido.js` | Visibilidade do menu *Ações* na lista |
| `webapp/ext/ImportarPlanilha.js` | Diálogo de upload que chama a action `importarPlanilha` |
| `webapp/test/integration/` | Testes OPA5 gerados pelo Fiori tools |

Visão geral das apps: [`../README.md`](../README.md).

<details>
<summary>Dados da geração (SAP Fiori tools)</summary>

|               |
| ------------- |
|**Generation Date and Time**<br>Thu Oct 08 2026 08:54:00 GMT-0300 (Horário Padrão de Brasília)|
|**App Generator**<br>SAP Fiori Application Generator|
|**App Generator Version**<br>1.28.0|
|**Generation Platform**<br>CLI|
|**Template Used**<br>List Report Page V4|
|**Service Type**<br>Local CAP|
|**Service URL**<br>http://localhost:4004/odata/v4/pedidos/|
|**Module Name**<br>pedidos-compras|
|**Application Title**<br>Pedidos de Compras|
|**Namespace**<br>|
|**UI5 Theme**<br>sap_horizon|
|**UI5 Version**<br>1.148.12|
|**Enable TypeScript**<br>False|
|**Add Eslint configuration**<br>True, see https://www.npmjs.com/package/@sap-ux/eslint-plugin-fiori-tools#rules for the eslint rules.|
|**Main Entity**<br>Pedidos|

</details>
