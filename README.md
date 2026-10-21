<h1 align="center">Pedidos de Compras – SAP CAP / Node.js</h1>

<p align="center">
  Sistema de pedidos de compras com backend em <b>SAP Cloud Application Programming Model (CAP)</b>
  e oito aplicações <b>SAPUI5</b>, implementado em duas versões equivalentes: <b>JavaScript</b> e
  <b>TypeScript</b>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/SAP%20CAP-10-0FAAFF?style=for-the-badge&logo=sap&logoColor=white" alt="SAP CAP 10">
  <img src="https://img.shields.io/badge/Node.js-22%2B-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js 22+">
  <img src="https://img.shields.io/badge/JavaScript-ESM-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript ESM">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript strict">
  <br>
  <img src="https://img.shields.io/badge/OData-V4-E9540D?style=for-the-badge" alt="OData V4">
  <img src="https://img.shields.io/badge/SAP%20Fiori-Elements-354A5F?style=for-the-badge&logo=sap&logoColor=white" alt="SAP Fiori Elements">
  <img src="https://img.shields.io/badge/SAPUI5-1.148%20LTS-1873B4?style=for-the-badge&logo=sap&logoColor=white" alt="SAPUI5 1.148 LTS">
  <img src="https://img.shields.io/badge/testes-74%20JS%20%7C%2076%20TS-9C3493?style=for-the-badge" alt="74 testes em JavaScript e 76 em TypeScript">
</p>

<p align="center">
  <img src="assets/launchpad/launchpad.png" alt="Launchpad local com os oito tiles" width="900">
</p>

---

## Índice

- [Visão geral](#visão-geral)
- [Aplicações](#aplicações)
- [Principais funcionalidades](#principais-funcionalidades)
- [Ciclo de vida do pedido](#ciclo-de-vida-do-pedido)
- [Arquitetura](#arquitetura)
- [Tecnologias](#tecnologias)
- [Como executar](#como-executar)
- [Testes](#testes)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Status e pendências](#status-e-pendências)
- [Documentação](#documentação)
- [Histórico de versões](#histórico-de-versões)
- [Autor](#autor)

---

## Visão geral

O sistema cobre o processo de compra de ponta a ponta: **cadastro de clientes** (com endereço
preenchido pelo CEP via ViaCEP), **controle de estoque**, **pedidos** com reserva de estoque e
pagamento simulado, **reembolsos** de pedidos cancelados, **importação por planilha** e **análises**
com indicadores e gráficos.

O repositório traz o mesmo sistema em duas implementações. Ambas compartilham o modelo CDS, os
serviços OData V4, as apps SAPUI5, os dados de demonstração e a suíte de testes; muda apenas a
linguagem do backend.

| Pasta | Implementação | Detalhes |
| --- | --- | --- |
| [`nodejs-padrao/`](nodejs-padrao) | JavaScript (ESM) | [README](nodejs-padrao/README.md) |
| [`nodejs-typescript/`](nodejs-typescript) | TypeScript `strict`, com tipos gerados pelo `cds-typer` | [README](nodejs-typescript/README.md) |

---

## Aplicações

Quatro apps de **gestão** (Fiori Elements: List Report + Object Page) e quatro de **análise**
(SAPUI5 freestyle), reunidas num launchpad local.

| App | Para que serve | Serviço OData V4 |
| --- | --- | --- |
| Gestão de Clientes | Clientes e endereços, com preenchimento pelo CEP | `ClientesService` |
| Gestão de Estoque | Itens (SKU, foto, categoria), disponibilidade e status | `EstoqueService` |
| Pedidos de Compras | Pedidos, itens, pagamento, aprovação e cancelamento | `PedidosService` |
| Gestão de Reembolsos | Aprovação ou rejeição de reembolsos | `ReembolsosService` |
| Análise de Pedidos, Clientes, Itens do Estoque e Reembolsos | Indicadores e 5 gráficos por domínio, com detalhe de cada análise | `AnaliticoService` |

| Pedidos de Compras | Object Page do pedido |
| :----------------: | :-------------------: |
| <img src="assets/pedidos/pedidos.png" alt="Lista de pedidos" width="440"> | <img src="assets/pedidos/pedido-object-page.png" alt="Object Page de um pedido finalizado" width="440"> |

<details>
<summary>Mais capturas de tela</summary>

| Gestão de Clientes | Gestão de Estoque |
| :----------------: | :---------------: |
| <img src="assets/clientes/clientes.png" alt="Lista de clientes" width="440"> | <img src="assets/estoque/estoque.png" alt="Lista de itens de estoque" width="440"> |

| Gestão de Reembolsos | Efetuar Pagamento |
| :------------------: | :---------------: |
| <img src="assets/reembolsos/reembolsos.png" alt="Lista de reembolsos" width="440"> | <img src="assets/pedidos/pagamento-mascara.png" alt="Diálogo Efetuar Pagamento com máscara no cartão, validade e CVV" width="440"> |

| Análise de Pedidos de Compras | Análise de Clientes |
| :---------------------------: | :-----------------: |
| <img src="assets/analises/analise-pedidos.png" alt="Painel da Análise de Pedidos de Compras" width="440"> | <img src="assets/analises/analise-clientes.png" alt="Painel da Análise de Clientes" width="440"> |

| Análise de Itens do Estoque | Análise de Pedidos de Reembolsos |
| :-------------------------: | :------------------------------: |
| <img src="assets/analises/analise-estoque.png" alt="Painel da Análise de Itens do Estoque" width="440"> | <img src="assets/analises/analise-reembolsos.png" alt="Painel da Análise de Pedidos de Reembolsos" width="440"> |

</details>

---

## Principais funcionalidades

- **Pedido simples de preencher**: o usuário informa só o cliente e os itens; endereço, preços,
  totais, número e status vêm do backend.
- **Reserva de estoque**: o pedido reserva o estoque ao ser salvo, ajusta a reserva pela diferença
  quando os itens mudam e dá baixa na aprovação.
- **Pagamento simulado** por cartão (VISA/Mastercard), com máscara de digitação; só bandeira, últimos
  4 dígitos e resultado são gravados.
- **Reembolso**: cancelar um pedido já pago abre uma solicitação, aprovada ou rejeitada na Gestão de
  Reembolsos.
- **Endereço pelo CEP**: o backend consulta o ViaCEP e preenche logradouro, bairro, cidade e UF; o CEP
  é único por cliente.
- **Importação por planilha** (`.xlsx` ou `.csv`) de clientes, itens e pedidos, no modo tudo ou nada.
- **Análises** com filtros, indicadores e gráficos sobre agregações `$apply`.
- **Navegação entre apps** pelo launchpad: do pedido para o cliente, o item e o reembolso, e vice-versa.
- **Perfis** `Admin` e `Comum`, e **concorrência** tratada: de duas ações simultâneas sobre o mesmo
  pedido, só a primeira vale.

As regras completas estão na [especificação técnica](docs/especificacao-tecnica.md).

---

## Ciclo de vida do pedido

**Criar** (cliente e itens) → **Salvar** (reserva o estoque) → **Efetuar Pagamento** →
**Aprovar pedido**, ou **Cancelar pedido** a qualquer momento antes da aprovação.

<p align="center">
  <a href="assets/diagramas/diagrama-ciclo-pedido.png"><img src="assets/diagramas/diagrama-ciclo-pedido.png" alt="Ciclo de vida do pedido: status, transições e ações por status" width="900"></a>
</p>

---

## Arquitetura

<p align="center">
  <a href="assets/diagramas/diagrama-arquitetura.png"><img src="assets/diagramas/diagrama-arquitetura.png" alt="Arquitetura da solução: launchpad, apps Fiori Elements e freestyle, serviços OData do SAP CAP, srv/lib, modelo CDS, SQLite, SAP HANA Cloud, XSUAA e API ViaCEP" width="900"></a>
</p>

Cada app tem seu serviço OData V4. As regras que atravessam domínios (estoque, snapshots,
cancelamento e reembolso) ficam em `srv/lib` e rodam na transação da requisição: qualquer erro desfaz
tudo. Em desenvolvimento o banco é SQLite; em produção, SAP HANA Cloud.

Outros diagramas (o arquivo editável de todos está em
[`docs/arquitetura-e-processos.drawio`](docs/arquitetura-e-processos.drawio)):

- [Arquitetura alvo na SAP BTP](assets/diagramas/diagrama-arquitetura-btp.png)
- [Registro do pedido](assets/diagramas/diagrama-registro-pedido.png) ·
  [Efetuar Pagamento](assets/diagramas/diagrama-efetuar-pagamento.png) ·
  [Aprovação do pedido](assets/diagramas/diagrama-aprovacao-pedido.png) ·
  [Cancelamento e reembolso](assets/diagramas/diagrama-cancelamento-reembolso.png)
- [Consulta de CEP](assets/diagramas/diagrama-endereco-cep.png) ·
  [Importação por planilha](assets/diagramas/diagrama-importacao-planilha.png)

---

## Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Backend | Node.js 22+, `@sap/cds` 10 (ESM); JavaScript ou TypeScript 6 `strict` |
| Banco | SQLite em desenvolvimento; SAP HANA Cloud em produção |
| Serviços | OData V4 com rascunho (draft), autorização por papel e agregações `$apply` |
| Front-end | SAPUI5 1.148 (LTS): Fiori Elements V4 e apps freestyle, servidos pelo `cds-plugin-ui5` |
| Integração | API ViaCEP |
| Qualidade | `node:test` + `@cap-js/cds-test`, ESLint 10, UI5 linter |

---

## Como executar

Pré-requisitos: **Node.js 22+**, `npm` e acesso à internet (SAPUI5 via CDN e ViaCEP).

```sh
git clone https://github.com/AdrianoBispo/sap-cap-nodejs-pedidos-de-compras-app.git
cd sap-cap-nodejs-pedidos-de-compras-app/nodejs-padrao   # ou nodejs-typescript
npm install
npm run watch
```

Abra **http://localhost:4004/launchpad.html** e entre com um dos usuários de desenvolvimento:

| Usuário / senha | Papel | Pode |
| --- | --- | --- |
| `admin` / `admin` | `Admin` | Tudo |
| `comum` / `comum` | `Comum` | Consultar clientes e estoque; criar e operar pedidos; decidir reembolsos; ver análises |

Na primeira execução é criado o banco `db.sqlite` com dados de demonstração (100 clientes, 100 itens e
100 pedidos em todos os status), mantido entre reinícios. Para recriá-lo: `npm run db:deploy`.

**Para experimentar o pagamento**: cartão `4111 1111 1111 1111`, validade futura (ex.: `12/30`) e CVV
`123` aprovam; CVV `000` recusa.

Os demais scripts (`lint`, `typecheck`, `build`, `https`, `dados:demo`) estão descritos no README de
cada implementação.

---

## Testes

```sh
npm test         # em nodejs-padrao ou nodejs-typescript
```

São 74 testes em JavaScript e 76 em TypeScript, cobrindo clientes, estoque, pedidos, reembolsos,
importação e análises. Rodam em SQLite em memória e com um ViaCEP falso, sem depender da rede. As apps
de análise têm também testes QUnit, executados no navegador.

---

## Estrutura do repositório

```text
.
├── nodejs-padrao/        implementação em JavaScript
├── nodejs-typescript/    implementação em TypeScript (mesma estrutura)
│   ├── app/              apps SAPUI5 e launchpad local
│   ├── db/               modelo CDS e dados de demonstração
│   ├── srv/              serviços, handlers e regras de domínio (srv/lib)
│   └── test/             testes automatizados
├── assets/               capturas de tela e diagramas
└── docs/                 especificação técnica, diagramas, apresentações e modelos de importação
```

---

## Status e pendências

O projeto roda localmente, com SQLite e autenticação *mocked*. A configuração para o **SAP HANA
Cloud** já existe, mas a implantação na **SAP BTP** (XSUAA, MTA e deploy) ainda está pendente; a
arquitetura alvo está no [diagrama da BTP](assets/diagramas/diagrama-arquitetura-btp.png) e na seção
14 da [especificação técnica](docs/especificacao-tecnica.md).

---

## Documentação

- [Especificação técnica](docs/especificacao-tecnica.md) ([versão Word](docs/especificacao-tecnica.docx)):
  modelo de dados, serviços, regras de negócio, importação, análises, interface e testes.
- READMEs das implementações: [JavaScript](nodejs-padrao/README.md) e
  [TypeScript](nodejs-typescript/README.md).
- [Apresentações](docs/apresentacoes) (um deck por etapa do desenvolvimento).
- [Modelos de planilha para importação](docs/modelos-importacao).
- [Arquitetura e fluxogramas](docs/arquitetura-e-processos.drawio) (draw.io).
- Mesma aplicação em SAP RAP / ABAP Cloud:
  [sap-abap-rap-pedidos-de-compras-app](https://github.com/AdrianoBispo/sap-abap-rap-pedidos-de-compras-app).

---

## Histórico de versões

| Versão | Mudanças |
| --- | --- |
| v1.11 | README principal simplificado, com foco na visão geral; detalhes remetidos à especificação técnica |
| v1.10 | Especificação técnica 2.6 simplificada e ilustrada com diagramas e capturas de tela |
| v1.9 | Correção da gravação de fotos; SQLite em arquivo em desenvolvimento e SAP HANA Cloud em produção |
| v1.8 | Diagramas de arquitetura e dos processos no draw.io, com as formas oficiais da SAP |
| v1.7 | Ações do pedido e do reembolso protegidas contra concorrência |
| v1.6 | Revisão e documentação do código; permissões do usuário só de consulta refletidas nas apps |
| v1.5 | Análises divididas em quatro apps; máscara no pagamento; navegação entre Object Pages completada |
| v1.4 | Importação de pedidos sem duplicidade (referência de importação) |
| v1.3 | Navegação entre aplicações por objetos semânticos |
| v1.2 | Pedido informa só cliente e itens; pagamento e snapshots somente leitura |
| v1.1 | Versão TypeScript e proxy HTTPS local |
| v1.0 | Versão JavaScript: modelo, serviços, regras, apps, launchpad, importação, análises e testes |

---

## Autor

Desenvolvido por **Adriano Bispo**.

[![GitHub](https://img.shields.io/badge/GitHub-AdrianoBispo-181717?style=for-the-badge&logo=github)](https://github.com/AdrianoBispo)
