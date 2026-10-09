# Pedidos de Compras — SAP CAP (Node.js + JavaScript)

Porte para o **SAP Cloud Application Programming Model (CAP) 10** da aplicação de Pedidos de
Compras construída em SAP RAP (pacote `ZAVBS_PC`). Backend em **Node.js (ESM, JavaScript)**,
banco **SQLite** em desenvolvimento e oito aplicações **SAPUI5** (quatro Fiori Elements de gestão e
quatro freestyle de análise) servidas pelo próprio CAP.

> A versão em TypeScript (equivalente, com tipos gerados pelo cds-typer) fica em
> [`../nodejs-typescript`](../nodejs-typescript) e a especificação técnica em
> [`../docs/especificacao-tecnica.md`](../docs/especificacao-tecnica.md).

## Aplicações

| Aplicação | Caminho | Serviço OData V4 | Equivalente RAP |
| --- | --- | --- | --- |
| Gestão de Clientes | `/gestaoclientes/index.html` | `/odata/v4/clientes` (`ClientesService`) | `ZUI_PC_CLIENTES` |
| Gestão de Estoque | `/gestaoestoque/index.html` | `/odata/v4/estoque` (`EstoqueService`) | `ZUI_PC_ESTOQUE` |
| Pedidos de Compras | `/pedidoscompras/index.html` | `/odata/v4/pedidos` (`PedidosService`) | `ZUI_PC_PEDIDOS_COMPRAS` |
| Gestão de Reembolsos | `/gestaoreembolsos/index.html` | `/odata/v4/reembolsos` (`ReembolsosService`) | `ZUI_PC_REEMBOLSOS` |
| Análise de Pedidos de Compras | `/analisepedidos/index.html` | `/odata/v4/analitico` (`AnaliticoService`) | `ZUI_PC_ANALITICO` |
| Análise de Clientes | `/analiseclientes/index.html` | `/odata/v4/analitico` (`AnaliticoService`) | `ZUI_PC_ANALITICO` |
| Análise de Itens do Estoque | `/analiseestoque/index.html` | `/odata/v4/analitico` (`AnaliticoService`) | `ZUI_PC_ANALITICO` |
| Análise de Pedidos de Reembolsos | `/analisereembolsos/index.html` | `/odata/v4/analitico` (`AnaliticoService`) | `ZUI_PC_ANALITICO` |
| Launchpad local | `/launchpad.html` | — | Fiori Launchpad / Work Zone |

## Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Runtime | Node.js 22+, `@sap/cds` 10, módulos ESM |
| Banco | SQLite em memória (`@cap-js/sqlite`) — SAP HANA Cloud fica para a implantação |
| Serviços | OData V4 com rascunho (draft), `@restrict`, `@assert`/`@mandatory`, `$apply` |
| Front-end | SAPUI5 1.148 (LTS): Fiori Elements V4 (List Report/Object Page) e apps freestyle, `cds-plugin-ui5` |
| Integração | ViaCEP (`fetch` nativo, URL em `cds.requires.viacep`) |
| Qualidade | `node:test` + `@cap-js/cds-test` (68 testes), ESLint 10, UI5 linter |

## Como executar

```sh
npm install          # instala o CAP e as dependências dos apps (workspaces app/*)
npm run watch        # cds watch: serviços + apps em http://localhost:4004
```

Abra `http://localhost:4004/launchpad.html` (launchpad com os oito tiles) ou a página inicial do
CAP. Usuários de desenvolvimento (autenticação *mocked*):

| Usuário | Senha | Papel | Permissões |
| --- | --- | --- | --- |
| `admin` | `admin` | `Admin` | Tudo: clientes, estoque, pedidos, reembolsos e análises |
| `comum` | `comum` | `Comum` | Consulta clientes e estoque; cria e opera pedidos; decide reembolsos; análises |

O banco é recriado a cada inicialização com os dados de demonstração de `db/data` (100 clientes,
100 itens e 100 pedidos em todos os status). Para regenerar os CSVs: `npm run dados:demo`.

## Testes e lint

```sh
npm test             # 68 testes (unidade + serviços), com ViaCEP falso local
npm run lint         # ESLint (configuração recomendada do CAP)
```

Os testes são permanentes, como a suíte ABAP Unit do projeto RAP: devem ser mantidos e ajustados
junto com as regras de negócio.

| Arquivo | Cobertura |
| --- | --- |
| `test/unidade.test.js` | CPF, e-mail, telefone, imagens, status de estoque, SKU, pagamento simulado, leitor XLSX/CSV |
| `test/clientes.test.js` | rascunho, ViaCEP, CEP geral, CEP único, endereço principal, CPF, autorização, exclusão, foto |
| `test/estoque.test.js` | SKU, disponibilidade e status, concorrência com edição, inativação e exclusão |
| `test/pedidos.test.js` | registro com reserva, edição pela diferença, pagamento, aprovação, cancelamento, reembolso, campos somente leitura |
| `test/reembolsos.test.js` | aprovar, rejeitar (motivo obrigatório), decisão única |
| `test/importacao.test.js` | importação de clientes, estoque e pedidos (tudo ou nada), reimportação de pedidos recusada e dos modelos em `docs/` |
| `test/analitico.test.js` | agregações `$apply` dos quatro domínios |

As apps de análise têm testes QUnit em `app/analise-*/webapp/test`, abertos no navegador com
`npm run watch` (ex.: `/analisepedidos/test/testsuite.qunit.html`).

## Estrutura

```text
nodejs-padrao/
├── _i18n/messages.properties    mensagens de negócio (porte da message class ZPC_MSG)
├── app/
│   ├── common.cds               rótulos, textos de CodeList, campos somente leitura
│   ├── services.cds             reúne as anotações das apps
│   ├── gestao-clientes/         Fiori Elements (annotations.cds + webapp/)
│   ├── gestao-estoque/          Fiori Elements
│   ├── pedidos-compras/         Fiori Elements
│   ├── gestao-reembolsos/       Fiori Elements
│   ├── analise-pedidos/         SAPUI5 freestyle: Análise de Pedidos de Compras
│   ├── analise-clientes/        SAPUI5 freestyle: Análise de Clientes
│   ├── analise-estoque/         SAPUI5 freestyle: Análise de Itens do Estoque
│   ├── analise-reembolsos/      SAPUI5 freestyle: Análise de Pedidos de Reembolsos
│   ├── launchpad.html           sandbox do Fiori launchpad
│   └── launchpad/               configuração e inicialização do launchpad
├── db/
│   ├── common.cds               tipos e CodeLists
│   ├── schema.cds               entidades (porte das tabelas ZTA_PC_*)
│   └── data/                    CodeLists e dados de demonstração (CSV)
├── srv/
│   ├── *-service.cds            serviços (um por aplicação) + analitico-service.cds
│   ├── *-service.js             handlers (porte das behavior pools ZBP_R_PC_*)
│   ├── validacoes.cds           @mandatory / @assert
│   └── lib/                     regras de domínio reutilizáveis
├── scripts/gerar-dados-demo.js  gerador dos CSVs de demonstração
└── test/                        testes automatizados
```

## Regras principais

- **Clientes**: rascunho; CPF válido (dígitos) e único; e-mail, telefone (10/11 dígitos) e
  nascimento validados; score sorteado (0–100) exibido em % com cor; exclusão bloqueada com pedido.
- **Endereços**: o CEP preenche o endereço (CEP já cadastrado é reaproveitado; senão ViaCEP); CEP
  geral exige logradouro e bairro; CEP único por cliente; o primeiro endereço vira principal e a
  ação *Definir como principal* desmarca os demais.
- **Estoque**: SKU `SKU-<3 letras da categoria>-<10 dígitos>` gerado no Save (e regenerado se a
  categoria muda); `qtdeDisponivel` e `statusEstoque` são colunas calculadas pelo banco; a reserva
  só é alterada pelos pedidos; inativação e exclusão controladas.
- **Pedidos**: o Save do rascunho registra o pedido (`ABERTO`), gera o número e reserva o estoque;
  no pedido aberto só os itens mudam e a reserva é ajustada pela diferença; *Efetuar Pagamento*
  (cartão simulado em diálogo com máscara no cartão, validade e CVV; nada sensível é gravado), *Aprovar pedido* (baixa, snapshots, `FINALIZADO`) e
  *Cancelar pedido* (libera a reserva e gera snapshots; com pagamento aprovado abre reembolso).
- **Reembolsos**: *Aprovar* cancela o pedido, libera a reserva e devolve o pagamento; *Rejeitar*
  (motivo obrigatório) devolve o pedido ao status anterior.
- **Navegação entre apps** (launchpad local): no pedido, Cliente/CPF abrem o cliente, Item/SKU
  abrem o item e *Solicitação de reembolso* abre o reembolso; no histórico (snapshots), cliente e item
  abrem as apps de origem; no reembolso, o Pedido abre o pedido e Cliente/CPF abrem o cliente; nas
  análises, *Abrir gestão* abre a app de gestão do domínio.
- **Concorrência**: cada movimento de estoque é um `UPDATE` condicional atômico ("só reserva se o
  saldo atual cobre a quantidade"); qualquer erro desfaz a transação inteira.
- **Importação por planilha** (`.xlsx`/`.csv`) em Clientes, Estoque e Pedidos, tudo ou nada; a
  referência do pedido (coluna Pedido) não é reimportada para o mesmo cliente; modelos
  em [`../docs/modelos-importacao`](../docs/modelos-importacao).

## Diferenças em relação ao RAP

| Tema | RAP (`ZAVBS_PC`) | CAP |
| --- | --- | --- |
| Numeração | Number Range Object `ZPC_NR` | Tabela `Numeracoes` com incremento atômico na transação |
| Disponível/status do estoque | Colunas mantidas por determinations | Colunas geradas (`stored`) no banco |
| Object Page dinâmica | Colunas `xfeld` persistidas (`AtualizarFlagsStatus`) | Elementos calculados na leitura |
| CEP do endereço | Chave da tabela, somente leitura após gravar | Chave é só o `ID`: o CEP pode ser alterado |
| Concorrência de estoque | Lock do BO Item via EML | `UPDATE` condicional atômico |
| Autorização | IAM App, objetos `ZPC_ADMIN`/`ZPC_PEDIDO`, `c_modo_trial` | Papéis `Admin`/`Comum` com `@requires`/`@restrict` |
| Leitor XLSX | XCO (sem `inlineStr`, recusa LibreOffice) | Leitor próprio (ZIP + XML), aceita ambos |

## SAP HANA Cloud (pendente)

A conexão com o SAP HANA Cloud será configurada na implantação. Passos previstos:

```sh
cds add hana          # adiciona @cap-js/hana e o perfil [production]
cds add xsuaa,mta     # autenticação e descritor MTA para Cloud Foundry
cds build --production
```

O modelo foi escrito com funções portáveis do CAP (`substring`, `length`, `year`, `month`,
`case`) e colunas geradas, que o SAP HANA também suporta. A execução sobre o SAP HANA Cloud ainda
não foi testada.
