# Pedidos de Compras — SAP CAP (Node.js + TypeScript)

Versão em **TypeScript** do sistema de Pedidos de Compras no **SAP Cloud Application Programming
Model (CAP) 10**. É funcionalmente idêntica à versão JavaScript de [`../nodejs-padrao`](../nodejs-padrao):
mesmo modelo CDS, mesmos serviços OData, mesmas oito aplicações SAPUI5, mesmos dados de demonstração e
a mesma suíte de testes, agora com
handlers, regras de domínio, testes e scripts escritos em TypeScript `strict` e tipados a partir do
modelo CDS pelo **cds-typer**.

> A especificação técnica (regras, modelo, serviços, telas) está em [`../docs`](../docs).

## Aplicações

| Aplicação | Caminho | Serviço OData V4 |
| --- | --- | --- |
| Gestão de Clientes | `/gestaoclientes/index.html` | `/odata/v4/clientes` (`ClientesService`) |
| Gestão de Estoque | `/gestaoestoque/index.html` | `/odata/v4/estoque` (`EstoqueService`) |
| Pedidos de Compras | `/pedidoscompras/index.html` | `/odata/v4/pedidos` (`PedidosService`) |
| Gestão de Reembolsos | `/gestaoreembolsos/index.html` | `/odata/v4/reembolsos` (`ReembolsosService`) |
| Análise de Pedidos de Compras | `/analisepedidos/index.html` | `/odata/v4/analitico` (`AnaliticoService`) |
| Análise de Clientes | `/analiseclientes/index.html` | `/odata/v4/analitico` (`AnaliticoService`) |
| Análise de Itens do Estoque | `/analiseestoque/index.html` | `/odata/v4/analitico` (`AnaliticoService`) |
| Análise de Pedidos de Reembolsos | `/analisereembolsos/index.html` | `/odata/v4/analitico` (`AnaliticoService`) |
| Launchpad local | `/launchpad.html` | — |

## Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Runtime | Node.js 22+, `@sap/cds` 10, módulos ESM |
| Linguagem | TypeScript 6.0 (`strict`, `noUnusedLocals`, `module: NodeNext`) |
| Tipos | `@cap-js/cds-typer` (classes geradas em `@cds-models`) e `@cap-js/cds-types` (API do CAP) |
| Execução | `tsx` em desenvolvimento e testes; `tsc` no `cds build` (JavaScript em `gen/srv`) |
| Banco | SQLite em memória (`@cap-js/sqlite`) — SAP HANA Cloud fica para a implantação |
| Serviços | OData V4 com rascunho (draft), `@restrict`, `@assert`/`@mandatory`, `$apply` |
| Front-end | SAPUI5 1.148 (LTS): Fiori Elements V4 (List Report/Object Page) e apps freestyle, `cds-plugin-ui5` |
| Integração | ViaCEP (`fetch` nativo, URL em `cds.requires.viacep`) |
| Qualidade | `node:test` + `@cap-js/cds-test` (74 testes), ESLint 10 + `typescript-eslint`, `tsc --noEmit` |

## Como executar

```sh
npm install          # instala o CAP, as ferramentas TypeScript e os apps (workspaces app/*)
npm run watch        # cds-tsx watch: gera @cds-models, serve os .ts com tsx em http://localhost:4004
```

Abra `http://localhost:4004/launchpad.html` (launchpad com os oito tiles) ou a página inicial do
CAP. Usuários de desenvolvimento (autenticação *mocked*):

| Usuário | Senha | Papel | Permissões |
| --- | --- | --- | --- |
| `admin` | `admin` | `Admin` | Tudo: clientes, estoque, pedidos, reembolsos e análises |
| `comum` | `comum` | `Comum` | Consulta clientes e estoque (as apps escondem Criar, Editar, Excluir e Importar); cria e opera pedidos; decide reembolsos; análises |

O banco é recriado a cada inicialização com os dados de demonstração de `db/data` (100 clientes,
100 itens e 100 pedidos em todos os status). Para regenerar os CSVs: `npm run dados:demo`.

## Scripts

| Script | O que faz |
| --- | --- |
| `npm run watch` | `cds-tsx watch`: servidor com recarga automática executando os `.ts` via `tsx` |
| `npm run typer` | Gera os tipos do modelo CDS em `@cds-models` (`cds-typer "*"`) |
| `npm run typecheck` | `typer` + `tsc --noEmit` (verificação de tipos em `srv/`, `test/` e `scripts/`) |
| `npm test` | `typer` + 74 testes (`node --test` com `tsx`, `CDS_TYPESCRIPT=tsx`), com ViaCEP falso local |
| `npm run lint` | ESLint (recomendado do CAP + `typescript-eslint`) e `typecheck` |
| `npm run build` | `cds build --production`: modelo compilado e `tsc` (`tsconfig.cdsbuild.json`) em `gen/srv` |
| `npm run serve` | `cds-tsx serve`: servidor sem recarga, executando os `.ts` via `tsx` |
| `npm start` | `cds-serve`: comando de produção, para o JavaScript de `gen/srv` (na raiz, use `watch`/`serve`) |
| `npm run dados:demo` | Regenera os CSVs de `db/data` (`scripts/gerar-dados-demo.ts`) |

A pasta `@cds-models` não é versionada: `npm test`, `npm run typecheck` e `cds watch` a geram
automaticamente. Depois de alterar um `.cds`, rode `npm run typer` para o editor enxergar os tipos novos.

## Tipagem a partir do modelo CDS

Os handlers importam as entidades geradas pelo cds-typer pelo alias `#cds-models/*` (campo
`imports` do `package.json`), em vez de usar `this.entities` ou `cds.entities(...)` sem tipo:

```ts
import { Pedidos, ItensPedido, importarPlanilha, type Pedido } from '#cds-models/PedidosService'
import { Itens as ItensDb } from '#cds-models/pedidoscompras'

type ParametrosPagamento = typeof Pedido.actions.efetuarPagamento.__parameters

export default class PedidosService extends cds.ApplicationService {
  override init() {
    this.before('NEW', ItensPedido.drafts, req => {   // req.data: ItemPedido (rascunho)
      req.data.qtdeItemPedido ??= 1
    })
    this.on('efetuarPagamento', Pedidos, async (req: Request<ParametrosPagamento>) => { ... })
    this.on(importarPlanilha, req => importarPedidos(req, this))   // parâmetros da action tipados
    return super.init()
  }
}
```

- **Consultas**: `SELECT`, `INSERT`, `UPDATE` e `DELETE` globais aceitam as classes geradas e devolvem
  objetos tipados (`SELECT.one.from(Itens, ID)` → `Item | undefined`).
- **Nomes em português**: o cds-typer deriva o singular removendo o `s` final (`Itens` → `Iten`).
  `srv/typer.cds` define `@singular` para `Itens` (`Item`), `ItensPedido` (`ItemPedido`),
  `Numeracoes` (`Numeracao`) e projeções; as anotações só afetam os nomes dos tipos.
- **Enums**: os tipos `StatusPedido_code`, `StatusPagamento_code` etc. vêm do modelo; as constantes de
  `srv/lib/pedidos.ts` usam `satisfies` para garantir que só contêm códigos válidos.
- **Mensagens**: `srv/lib/mensagens.ts` concentra a única conversão de tipos necessária (o runtime
  aceita `args` nomeados nas mensagens; a tipagem do `cds-types` prevê só arrays).

## Testes e lint

```sh
npm test             # 74 testes (unidade + serviços), com ViaCEP falso local
npm run lint         # ESLint + verificação de tipos
```

| Arquivo | Cobertura |
| --- | --- |
| `test/unidade.test.ts` | CPF, e-mail, telefone, imagens, status de estoque, SKU, pagamento simulado, leitor XLSX/CSV (inclusive o limite do conteúdo descompactado) |
| `test/clientes.test.ts` | rascunho, ViaCEP, CEP geral, CEP único, endereço principal, CPF, autorização (inclusive `Permissoes`), exclusão, foto |
| `test/estoque.test.ts` | SKU, disponibilidade e status, concorrência com edição, inativação, exclusão e `Permissoes` |
| `test/pedidos.test.ts` | registro com reserva, edição pela diferença, pagamento, aprovação, cancelamento (inclusive ações recusadas no rascunho e ações com o pedido alterado por outra operação), reembolso, campos somente leitura |
| `test/reembolsos.test.ts` | aprovar, rejeitar (motivo obrigatório), decisão única |
| `test/importacao.test.ts` | importação de clientes, estoque e pedidos (tudo ou nada), nomes e pedidos já importados recusados e dos modelos em `docs/` |
| `test/analitico.test.ts` | agregações `$apply` dos quatro domínios |

Os testes sobem o servidor CAP com `CDS_TYPESCRIPT=tsx`, o que faz o CAP carregar `srv/*.ts` (sem a
variável, os serviços ficariam só com os handlers genéricos e os testes de regra falhariam).

## Estrutura

```text
nodejs-typescript/
├── _i18n/messages.properties    mensagens de negócio
├── app/                         as mesmas oito apps e o launchpad da versão JavaScript
├── db/
│   ├── common.cds               tipos e CodeLists
│   ├── schema.cds               entidades
│   └── data/                    CodeLists e dados de demonstração (CSV)
├── srv/
│   ├── *-service.cds            serviços (um por aplicação) + analitico-service.cds
│   ├── *-service.ts             handlers dos serviços
│   ├── validacoes.cds           @mandatory / @assert
│   ├── typer.cds                nomes singulares dos tipos gerados (@singular)
│   └── lib/*.ts                 regras de domínio reutilizáveis
├── scripts/gerar-dados-demo.ts  gerador dos CSVs de demonstração
├── test/                        testes automatizados (.test.ts) e apoio (ViaCEP falso, gerador XLSX)
├── tsconfig.json                verificação de tipos (srv, test, scripts)
├── tsconfig.cdsbuild.json       compilação de srv/ para gen/srv no cds build
└── eslint.config.mjs            ESLint do CAP + typescript-eslint para *.ts
```

## Diferenças em relação à versão JavaScript

| Tema | `nodejs-padrao` (JavaScript) | `nodejs-typescript` |
| --- | --- | --- |
| Handlers e regras | `srv/*.js`, `srv/lib/*.js` | `srv/*.ts`, `srv/lib/*.ts` (mesma lógica, mesma organização) |
| Acesso às entidades | `this.entities` / `cds.entities('pedidoscompras')` | Classes do cds-typer (`#cds-models/...`) |
| Consultas | `cds.ql` desestruturado | `SELECT`/`INSERT`/`UPDATE`/`DELETE` globais tipados |
| Sequenciais | `UPDATE ... .set('ultimoNumero = ultimoNumero + 1')` | `.with({ ultimoNumero: { '+=': 1 } })` (mesmo SQL atômico) |
| Rascunhos de outro serviço | `cds.model.definitions['PedidosService.Pedidos.drafts']` | `Pedidos.drafts` importado de `#cds-models/PedidosService` |
| Testes | `node --test test/**/*.test.js` | `node --import tsx --test test/**/*.test.ts` |
| Produção | `cds build` copia os `.js` | `cds build` roda `tsc` e gera os `.js` em `gen/srv` |
| Modelo, apps, dados, i18n | — | idênticos (cópias de `nodejs-padrao`) |

### Por que TypeScript 6.0 e não 7

O `cds init --add typescript` do CAP 10 sugere `typescript@^7` (compilador nativo). O TypeScript 7
não tem API JavaScript, e duas ferramentas do projeto dependem dela: o `typescript-eslint` (exige
`typescript < 6.1`) e o plugin ESLint das apps Fiori (`@sap-ux/eslint-plugin-fiori-tools`), que quebra
ao carregar o TypeScript 7 instalado na raiz. O TypeScript 6.0 é a última versão com essa API e já
tem a semântica do 7, então a migração futura é só trocar a versão quando o ecossistema suportar.

### Tipos do `@sap/cds`

O `tsconfig.json` aponta `@sap/cds` para `@cap-js/cds-types/dist/cds-types.js`. O `tsc` troca a
extensão e encontra o `.d.ts`; em tempo de execução o arquivo `.js` não existe e o `tsx` resolve o
pacote normalmente. Apontar direto para o `.d.ts` faria o `tsx` carregar a declaração vazia em vez
do CAP (`cds.ApplicationService` indefinido).

## SAP HANA Cloud (pendente)

Como na versão JavaScript, a conexão com o SAP HANA Cloud será configurada na implantação:

```sh
cds add hana          # adiciona @cap-js/hana e o perfil [production]
cds add xsuaa,mta     # autenticação e descritor MTA para Cloud Foundry
npm run build         # cds build --production (inclui a compilação TypeScript)
```

A execução sobre o SAP HANA Cloud ainda não foi testada.
