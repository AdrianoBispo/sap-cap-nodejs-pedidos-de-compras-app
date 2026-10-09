# Especificação Técnica — Sistema de Pedidos de Compras (SAP CAP + SAP Fiori)

> **Versão 2.0 — outubro de 2026.** Esta revisão descreve o sistema **como implementado** nas duas
> versões do repositório: [`nodejs-padrao`](../nodejs-padrao) (JavaScript) e
> [`nodejs-typescript`](../nodejs-typescript) (TypeScript). As duas compartilham o mesmo modelo CDS,
> os mesmos serviços, as mesmas aplicações SAPUI5 e a mesma suíte de testes; diferem apenas na
> linguagem dos handlers (seção 19). A seção 22 resume o que mudou em relação à versão 1.

---

## 1. Objetivo

Aplicação full stack de pedidos de compras com foco educacional, porte para o SAP Cloud Application
Programming Model (CAP) do projeto SAP RAP original (pacote `ZAVBS_PC`), contemplando:

- gestão de clientes e de seus endereços (com validação de CEP no ViaCEP);
- gestão de estoque (itens, SKU, reserva, baixa e liberação);
- ciclo completo do pedido: rascunho, registro com reserva de estoque, pagamento simulado,
  aprovação/finalização e cancelamento;
- solicitação e decisão de reembolso para pedidos pagos que são cancelados;
- preservação histórica por snapshots imutáveis;
- importação em massa por planilha (`.xlsx`/`.csv`);
- análises (indicadores e gráficos) sobre pedidos, clientes, estoque e reembolsos.

**Fora do objetivo:** gestão de envio, logística, rastreamento de entrega e integração real com
gateways de pagamento.

### 1.1 Stack tecnológica

| Camada | Tecnologia | Situação |
|---|---|---|
| Backend | SAP CAP 10 (`@sap/cds` 10) em Node.js 22+, módulos ESM | Implementado |
| Linguagem | JavaScript (`nodejs-padrao`) ou TypeScript 6.0 `strict` com cds-typer (`nodejs-typescript`) | Implementado |
| Banco local | SQLite em memória (`@cap-js/sqlite`), recriado a cada inicialização | Implementado |
| Banco produtivo | SAP HANA Cloud | Pendente (seção 21) |
| Protocolo | OData V4 com rascunho (draft), `$apply` para análises | Implementado |
| Frontend | SAPUI5 1.148 (LTS): 4 apps Fiori Elements V4 (List Report/Object Page) + 1 app freestyle | Implementado |
| Servidor das apps | `cds-plugin-ui5` (apps servidas pelo próprio CAP) | Implementado |
| Portal | Launchpad local (sandbox do SAP Fiori launchpad); SAP Build Work Zone na implantação | Local implementado; Work Zone pendente |
| Integração | ViaCEP via `fetch` nativo (URL em `cds.requires.viacep`) | Implementado |
| Segurança | Autenticação *mocked* com papéis `Admin`/`Comum`; XSUAA na implantação | Mocked implementado; XSUAA pendente |
| Deploy | Cloud Foundry / MTA (`mta.yaml`) | Pendente |
| Qualidade | `node:test` + `@cap-js/cds-test` (68 testes por versão), ESLint 10 | Implementado |

---

## 2. Escopo

### 2.1 Incluído

- Cadastro, consulta, edição (com rascunho), ativação/inativação e exclusão controlada de clientes.
- Múltiplos endereços por cliente, com exatamente um endereço principal.
- Preenchimento e validação do endereço pelo CEP (ViaCEP), com reaproveitamento de CEPs já
  cadastrados e tratamento de CEP geral de município.
- Cadastro, consulta, edição (com rascunho), inativação e exclusão controladas de itens de estoque.
- Estoque com quantidade total, reservada e disponível; status `SEM_ESTOQUE`/`ACABANDO`/`EM_ESTOQUE`.
- SKU gerado automaticamente no formato `SKU-<3 letras da categoria>-<10 dígitos>`.
- Pedido em rascunho; o **Salvar** registra o pedido (`ABERTO`), gera o número e reserva o estoque.
- Edição dos itens do pedido `ABERTO`, com ajuste da reserva pela diferença.
- Pagamento simulado com cartão de crédito ou débito, sem persistir dados sensíveis, com novas
  tentativas e apenas a última tentativa mantida.
- Aprovação/finalização com baixa do estoque e snapshots.
- Cancelamento com motivo; pedido pago gera solicitação de reembolso em vez de cancelar direto.
- Gestão de reembolsos: aprovar (cancela o pedido e devolve o pagamento) ou rejeitar (retoma o pedido).
- Importação por planilha de clientes, itens e pedidos, no modo "tudo ou nada".
- Camada analítica somente leitura com 20 análises em app freestyle.
- Controle de acesso por papel (`Admin` e `Comum`).
- Controle de concorrência nas movimentações de estoque.
- Testes automatizados permanentes (unidade e serviços).
- Dados de demonstração: 100 clientes, 100 itens e 100 pedidos em todos os status.

### 2.2 Fora do escopo

- Entrega, frete, transportadoras e rastreamento.
- Gateway de pagamento real e armazenamento de dados sensíveis de cartão.
- Histórico de tentativas de pagamento (só a última é mantida).
- Auditoria avançada, logs estruturados e monitoramento produtivo.
- Uso por clientes reais.

---

## 3. Perfis de Usuário e Permissões

| Recurso | `Comum` | `Admin` |
|---|---|---|
| Clientes e endereços | Consultar | Consultar, criar, editar, inativar, excluir, importar planilha |
| Itens de estoque | Consultar | Consultar, criar, editar, inativar, excluir, importar planilha |
| Pedidos | Criar, editar (`ABERTO`), pagar, aprovar, cancelar, importar planilha | Idem |
| Reembolsos | Consultar, aprovar, rejeitar | Idem |
| Análises | Consultar | Consultar |
| Snapshots e pagamentos persistidos | Somente leitura | Somente leitura |

Nenhum perfil pode editar pedidos finalizados ou cancelados, alterar snapshots ou consultar dados
sensíveis de cartão (eles nunca são gravados). Usuário não autenticado não acessa nenhum serviço.

---

## 4. Autenticação e Autorização

Em desenvolvimento a autenticação é *mocked* (HTTP Basic), configurada no `package.json`:

```json
{
  "cds": {
    "requires": {
      "auth": {
        "[development]": {
          "kind": "mocked",
          "users": {
            "admin": { "password": "admin", "roles": ["Admin"] },
            "comum": { "password": "comum", "roles": ["Comum"] },
            "*": false
          }
        }
      }
    }
  }
}
```

A autorização é declarativa nos serviços CDS:

| Serviço | Regra |
|---|---|
| Todos os serviços transacionais | `@requires: 'authenticated-user'` |
| `ClientesService.Clientes`, `Enderecos`; `EstoqueService.Itens` | `@restrict`: `READ` para `Comum`, `*` para `Admin` |
| `importarPlanilha` de clientes e de estoque | `@requires: 'Admin'` |
| `PedidosService.Pedidos`, `ReembolsosService.Reembolsos` | `@restrict`: `*` para `Comum` e `Admin` |
| `AnaliticoService` | `@requires: ['Comum', 'Admin']` |

Na implantação (pendente), os papéis `Admin` e `Comum` viram *role templates* do XSUAA
(`xs-security.json`) associados a *role collections* na subconta da SAP BTP.

---

## 5. Padrão de Nomenclatura

- Entidades no plural (`Clientes`, `Itens`, `Pedidos`), em português.
- CodeLists no plural ou com o nome do conceito (`Generos`, `StatusPedido`).
- Campos em `camelCase`; códigos de status em `UPPER_SNAKE_CASE`.
- Associações geram a chave estrangeira `<associação>_<chave>` (ex.: `cliente_ID`, `statusPedido_code`).
- Na versão TypeScript, os tipos gerados usam o singular (`Cliente`, `Item`, `ItemPedido`),
  definido em `srv/typer.cds` quando o singular não é o plural sem o `s` final.

### 5.1 Entidades persistentes (namespace `pedidoscompras`)

| Entidade | Finalidade | Tabela RAP de origem |
|---|---|---|
| `Clientes` | Cadastro de clientes | `ZTA_PC_CLIENTE` |
| `Enderecos` | Endereços dos clientes | `ZTA_PC_ENDERECO` |
| `Itens` | Itens do estoque | `ZTA_PC_ITEM` |
| `Pedidos` | Cabeçalho e ciclo de vida do pedido | `ZTA_PC_PEDIDO` |
| `ItensPedido` | Linhas do pedido | `ZTA_PC_ITEM_PED` |
| `Pagamentos` | Resultado seguro da última tentativa de pagamento | `ZTA_PC_PAGAMENTO` |
| `PedidosClienteSnapshots` | Cliente e endereço congelados no encerramento | `ZTA_PC_SNAP_CLI` |
| `PedidosItensSnapshots` | Itens congelados no encerramento | `ZTA_PC_SNAP_ITM` |
| `Reembolsos` | Solicitações de reembolso | `ZTA_PC_REEMBOLSO` |
| `Numeracoes` | Último número de cada sequencial (`PEDIDO`, `SKU`) | Number Range `ZPC_NR` |

### 5.2 CodeLists

Todas estendem o aspect `CodeListOrdenada` (`sap.common.CodeList` + `ordem` + `criticality`), com
textos traduzíveis (`name`, `descr`).

| Entidade | Códigos |
|---|---|
| `Generos` | `MASCULINO`, `FEMININO`, `NAO_BINARIO`, `OUTRO`, `NAO_INFORMADO` |
| `Categorias` | `ELETRONICOS`, `INFORMATICA`, `ESCRITORIO`, `CASA`, `VESTUARIO`, `ALIMENTOS`, `OUTROS` |
| `StatusEstoque` | `SEM_ESTOQUE`, `ACABANDO`, `EM_ESTOQUE` |
| `StatusPedido` | `ABERTO`, `AGUARDANDO_APROVACAO`, `PROCESSANDO_REEMBOLSO`, `CANCELADO`, `FINALIZADO` |
| `StatusPagamento` | `PENDENTE`, `APROVADO`, `RECUSADO`, `DEVOLVIDO` |
| `StatusReembolso` | `PENDENTE`, `APROVADO`, `REJEITADO` |
| `MetodosPagamento` | `CARTAO_CREDITO`, `CARTAO_DEBITO` |

A criticidade (`criticality`: 0 neutra, 1 negativa, 2 crítica, 3 positiva) colore os status na UI.

---

## 6. Modelagem de Dados

Arquivos: `db/common.cds` (tipos e CodeLists) e `db/schema.cds` (entidades). Todas as entidades
usam `cuid` (chave `ID` UUID) e `managed` (`createdAt`, `createdBy`, `modifiedAt`, `modifiedBy`).

### 6.1 Tipos reutilizáveis

| Tipo | Definição | Uso |
|---|---|---|
| `Cpf` | `String(11)` | CPF somente com dígitos |
| `Cep` | `String(8)` | CEP somente com dígitos |
| `Telefone` | `String(11)` | DDD + número, somente dígitos (10 ou 11) |
| `Valor` | `Decimal(15,2)` | Valores monetários (sempre com um `Currency`) |
| `StatusCep` | `String(1)` enum `V`/`I`/`X` | Validado, inválido, ViaCEP indisponível |
| `Criticidade` | `Integer` enum 0–3 | Criticidade Fiori |

### 6.2 `Clientes`

| Campo | Tipo | Regras |
|---|---|---|
| `fotoCliente` | `LargeBinary` (`@Core.MediaType`) | JPEG, PNG ou WEBP (MIME, extensão e assinatura binária) |
| `fotoClienteMimeType` | `String(50)` | MIME da foto |
| `fotoClienteNome` | `String(255)` | Nome do arquivo |
| `cpf` | `Cpf` | Obrigatório, dígitos verificadores válidos, único (`@assert.unique`) |
| `nome` | `String(255)` | Obrigatório |
| `email` | `String(100)` | Obrigatório, formato validado, gravado em minúsculas |
| `telefone` | `Telefone` | Obrigatório, 10 ou 11 dígitos |
| `genero` | `Association to Generos` | Opcional, deve existir (`@assert.target`) |
| `dataNascimento` | `Date` | Obrigatória, não pode ser futura |
| `clienteAtivo` | `Boolean default true` | Só cliente ativo faz pedidos |
| `scoreCliente` | `Decimal(5,2)` | Sorteado (0–100) na criação; somente leitura |
| `enderecos` | `Composition of many Enderecos` | Editados no rascunho do cliente |
| `enderecoPrincipal` | `Association to one Enderecos` (`principal = true`) | Usado em listas, pedidos e análises |
| `pedidos` | `Association to many Pedidos` | Bloqueia exclusão |
| `cpfFormatado` | calculado `String(14)` | `000.000.000-00` |
| `telefoneFormatado` | calculado `String(15)` | `(00) 00000-0000` ou `(00) 0000-0000` |
| `scoreCriticality` | calculado `Integer` | Cor do score: 1 (≤ 40), 2 (41–69), 3 (≥ 70) |

### 6.3 `Enderecos`

| Campo | Tipo | Regras |
|---|---|---|
| `cliente` | `Association to Clientes` | Dono do endereço |
| `cep` | `Cep` | Obrigatório; único por cliente (`@assert.unique.cepPorCliente`) |
| `logradouro`, `bairro` | `String(150)`, `String(100)` | Preenchidos pelo ViaCEP; editáveis e obrigatórios só para CEP geral |
| `numero` | `String(20)` | Obrigatório |
| `complemento` | `String(100)` | Opcional |
| `cidade`, `uf`, `estado` | `String(100)`, `String(2)`, `String(100)` | Sempre do ViaCEP (somente leitura) |
| `cepGeral` | `Boolean default false` | CEP de município sem logradouro/bairro |
| `cepStatus` | `StatusCep` | Resultado da validação (`V`, `I`, `X`) |
| `principal` | `Boolean default false` | Exatamente um por cliente |
| `cepFormatado` | calculado `String(9)` | `00000-000` |
| `enderecoCompleto` | calculado `String(500)` | `Logradouro, Nº - Compl. - Bairro - Cidade/UF - CEP 00000-000` |
| `controleCampoCep` | calculado `Integer` | Field control: 7 (obrigatório) para CEP geral, senão 1 (somente leitura) |

### 6.4 `Itens`

| Campo | Tipo | Regras |
|---|---|---|
| `fotoItem`, `fotoItemMimeType`, `fotoItemNome` | como em `Clientes` | JPEG, PNG ou WEBP |
| `sku` | `String(21)` | Gerado no Save; único (`@assert.unique.sku`) |
| `nome` | `String(120)` | Obrigatório |
| `descricao` | `String(500)` | Opcional |
| `categoria` | `Association to Categorias` | Obrigatória; define o prefixo do SKU |
| `qtdeEstoque` | `Integer default 0` | Obrigatória, `>= 0` e `>= qtdeReservada` |
| `qtdeReservada` | `Integer default 0` | Alterada somente pelos pedidos (nunca pela UI) |
| `qtdeDisponivel` | calculado **stored** | `qtdeEstoque - qtdeReservada` (coluna gerada, filtrável) |
| `statusEstoque_code` | calculado **stored** | `SEM_ESTOQUE` (≤ 0), `ACABANDO` (1–10), `EM_ESTOQUE` (≥ 11) |
| `statusEstoque` | `Association to StatusEstoque` | Texto e criticidade do status |
| `currency` | `Currency default 'BRL'` | Obrigatória |
| `precoUnitario` | `Valor` | Obrigatório, `>= 0` |
| `itemAtivo` | `Boolean default true` | Só item ativo entra em pedidos novos |

### 6.5 `Pedidos`

| Campo | Tipo | Regras |
|---|---|---|
| `numeroPedido` | `String(10)` | Sequencial com 10 dígitos, gerado no registro; único |
| `cliente` | `Association to Clientes` | Obrigatório; imutável após o registro |
| `endereco` | `Association to Enderecos` | Endereço principal do cliente (derivado) |
| `enderecoPrincipalCompleto` | `String(500)` | Texto do endereço usado no pedido |
| `itens` | `Composition of many ItensPedido` | Ao menos uma linha |
| `pagamento` | `Composition of one Pagamentos` | Última tentativa |
| `clienteSnapshot` | `Composition of one PedidosClienteSnapshots` | Criado no encerramento |
| `itensSnapshot` | `Composition of many PedidosItensSnapshots` | Criado no encerramento |
| `reembolsos` | `Association to many Reembolsos` | Solicitações do pedido |
| `statusPedido` | `Association to StatusPedido` | Ciclo de vida (seção 8) |
| `statusPagamento` | `Association to StatusPagamento` | Réplica do status do pagamento para lista e filtros |
| `observacao` | `String(500)` | Somente leitura na tela; preenchida na importação por planilha |
| `referenciaImportacao` | `String(40)` | Referência da planilha (coluna Pedido), gravada só pela importação; somente leitura |
| `currency`, `valorTotal` | `Currency default 'BRL'`, `Valor default 0` | Total calculado pelo backend |
| `dataFinalizacao` | `Timestamp` | Preenchida na aprovação |
| `motivoCancelamento`, `dataCancelamento`, `canceladoPor` | `String(500)`, `Timestamp`, `User` | Preenchidos no cancelamento |
| `encerrado`, `naoEncerrado`, `naoFinalizado`, `naoCancelado` | calculados `Boolean` | Dirigem as seções da Object Page |

Os campos `numeroPedido`, `statusPedido_code`, `statusPagamento_code`, `endereco_ID`,
`enderecoPrincipalCompleto`, `valorTotal`, `currency_code`, `dataFinalizacao`, `motivoCancelamento`,
`dataCancelamento` e `canceladoPor` são **controlados pelo backend**: qualquer valor enviado pela UI
é descartado.

### 6.6 `ItensPedido`

| Campo | Tipo | Regras |
|---|---|---|
| `pedido` | `Association to Pedidos` | Pedido dono da linha |
| `item` | `Association to Itens` | Obrigatório; item ativo (valor ajuda `ItensAtivos`) |
| `qtdeItemPedido` | `Integer` | Obrigatória, `> 0` (padrão 1 na nova linha) |
| `precoUnitarioSnapshot` | `Valor` | Provisório no rascunho; fixado no registro |
| `currency` | `Currency default 'BRL'` | Itens precisam estar em BRL |
| `valorTotal` | `Valor default 0` | `qtdeItemPedido × precoUnitarioSnapshot` (persistido) |
| `observacao` | `String(500)` | Livre |

### 6.7 `Pagamentos`

Somente a **última tentativa segura**. Número completo do cartão, validade e CVV **nunca** são
persistidos nem registrados em log.

| Campo | Tipo |
|---|---|
| `pedido` | `Association to Pedidos` |
| `metodoPagamento` | `Association to MetodosPagamento` |
| `statusPagamento` | `Association to StatusPagamento` |
| `bandeiraCartao` | `String(30)` (`VISA`, `MASTERCARD` ou `OUTRA`) |
| `ultimos4DigitosCartao` | `String(4)` |
| `cartaoMascarado` | `String(30)` (`**** **** **** 1234`) |
| `codigoAutorizacao` | `String(50)` (`SIM` + 6 dígitos; vazio na recusa) |
| `mensagemPagamento` | `String(255)` |
| `dataPagamento` | `Timestamp` |

### 6.8 `PedidosClienteSnapshots`

Cópia dos dados do cliente (`cpf`, `nome`, `email`, `telefone`, `genero`, `dataNascimento`,
`clienteAtivo`, `scoreCliente`) e do endereço do pedido (`endereco`, `cep`, `logradouro`, `numero`,
`complemento`, `bairro`, `cidade`, `uf`, `estado`, `enderecoCompleto`) no encerramento, com
`motivoSnapshot` (`FINALIZACAO` ou `CANCELAMENTO`) e os calculados `cpfFormatado` e
`telefoneFormatado`. Um por pedido.

### 6.9 `PedidosItensSnapshots`

Uma linha por item do pedido: `itemPedido`, `item`, `sku`, `nome`, `descricao`, `categoria`,
`quantidade`, `currency`, `precoUnitario` e `valorTotal` congelados no encerramento.

### 6.10 `Reembolsos`

| Campo | Tipo | Regras |
|---|---|---|
| `pedido`, `numeroPedido`, `cliente` | associações e `String(10)` | Pedido de origem |
| `statusReembolso` | `Association to StatusReembolso` | `PENDENTE` → `APROVADO` ou `REJEITADO` |
| `statusPedidoAnterior` | `Association to StatusPedido` | Restaurado se o reembolso for rejeitado |
| `currency`, `valorReembolso` | `Currency`, `Valor` | Total do pedido |
| `motivoSolicitacao`, `dataSolicitacao`, `solicitadoPor` | `String(500)`, `Timestamp`, `User` | Do cancelamento |
| `motivoDecisao`, `dataDecisao`, `decididoPor` | `String(500)`, `Timestamp`, `User` | Da decisão |

### 6.11 `Numeracoes`

`objeto` (`PEDIDO` ou `SKU`) e `ultimoNumero` (`Integer64`). O incremento é um `UPDATE` atômico
na transação da requisição: um Save que falha também desfaz o número (sem buracos na sequência).

### 6.12 Validações declarativas (`srv/validacoes.cds`)

`@mandatory`, `@assert.format`, `@assert.target` e `@assert` com expressões CDS, avaliados pelo CAP
nos PATCHs do rascunho (mensagens no Fiori) e no Save:

| Entidade | Validação | Mensagem |
|---|---|---|
| `Clientes` | `cpf`, `nome`, `email`, `telefone`, `dataNascimento` obrigatórios | padrão do CAP |
| `Clientes` | e-mail no formato `nome@dominio.tld` | `EMAIL_INVALIDO` |
| `Clientes` | telefone com 10 ou 11 dígitos | `TELEFONE_INVALIDO` |
| `Clientes` | nascimento não futuro | `DATA_NASCIMENTO_FUTURA` |
| `Enderecos` | `cep` e `numero` obrigatórios | `ENDERECO_NUMERO_OBRIGATORIO` |
| `Itens` | `nome`, `categoria`, `currency`, `precoUnitario`, `qtdeEstoque` obrigatórios | padrão do CAP |
| `Itens` | preço `>= 0` | `ITEM_PRECO_INVALIDO` |
| `Itens` | estoque `>= 0` e `>= qtdeReservada` | `ITEM_QTDE_ESTOQUE_INVALIDA` |
| `Pedidos` | `cliente` obrigatório | padrão do CAP |
| `ItensPedido` | `item` obrigatório, quantidade `> 0` | `ITEM_QTDE_INVALIDA` |

Regras que dependem de algoritmo ou de outros registros (dígitos do CPF, unicidade, ViaCEP,
estoque) ficam nos handlers.

---

## 7. Serviços OData

Todos em OData V4, sob `/odata/v4/<caminho>`, com um serviço por aplicação.

| Serviço | Caminho | Entidades expostas | Rascunho | Actions |
|---|---|---|---|---|
| `ClientesService` | `clientes` | `Clientes` (com `cidadePrincipal`, `ufPrincipal`), `Enderecos`, `Generos`, `CepsCadastrados` | `Clientes` (+ `Enderecos`) | `definirEnderecoPrincipal` (vinculada a `Enderecos`), `importarPlanilha` |
| `EstoqueService` | `estoque` | `Itens`, `Categorias`, `StatusEstoque` | `Itens` | `importarPlanilha` |
| `PedidosService` | `pedidos` | `Pedidos` (com dados do cliente), `Clientes`, `ClientesAtivos`, `Enderecos`, `Itens`, `ItensAtivos`, CodeLists | `Pedidos` (+ `ItensPedido`) | `efetuarPagamento`, `aprovarPedido`, `cancelarPedido` (vinculadas), `importarPlanilha` |
| `ReembolsosService` | `reembolsos` | `Reembolsos` (somente leitura, com dados do cliente), `StatusReembolso`, `StatusPedido` | — | `aprovarReembolso`, `rejeitarReembolso` (vinculadas) |
| `AnaliticoService` | `analitico` | `PedidosAnalise`, `ClientesAnalise`, `ItensAnalise`, `ReembolsosAnalise` (somente leitura) | — | — |

`CepsCadastrados` é uma visão agregada (um registro por CEP já validado e que não é CEP geral) usada
como ajuda de valores: escolher um CEP dela evita nova chamada ao ViaCEP. `ClientesAtivos` e
`ItensAtivos` são as ajudas de valores do pedido (só registros ativos).

### 7.1 Assinaturas das actions

```cds
// ClientesService
action definirEnderecoPrincipal() returns Enderecos;                       // vinculada a Enderecos
action importarPlanilha(arquivo : LargeBinary not null, nomeArquivo : String(255)) returns ResultadoImportacao;

// PedidosService (vinculadas a Pedidos)
action efetuarPagamento(
  @mandatory metodoPagamento : String(20),
  @mandatory numeroCartao    : String(19),
  @mandatory validade        : String(5),     // MM/AA
  @mandatory cvv             : String(4)) returns Pedidos;
action aprovarPedido() returns Pedidos;
action cancelarPedido(@mandatory motivoCancelamento : String(500)) returns Pedidos;

// ReembolsosService (vinculadas a Reembolsos)
action aprovarReembolso(motivoDecisao : String(500)) returns Reembolsos;
action rejeitarReembolso(@mandatory motivoDecisao : String(500)) returns Reembolsos;

// Resultado das importações
type ResultadoImportacao { registrosCriados : Integer; mensagem : String(255); }
```

As actions do pedido e do reembolso têm `@Core.OperationAvailable` (o botão só fica ativo no status
permitido) e `@Common.SideEffects` (a tela recarrega pedido, pagamento e snapshots após a execução).

### 7.2 Funções internas (não expostas)

Reserva, liberação e baixa de estoque, geração de número e de SKU, snapshots, cancelamento por
reembolso e retomada do pedido **não** são actions OData: são funções de `srv/lib` chamadas pelos
handlers dentro da transação da requisição.

| Módulo (`srv/lib`) | Responsabilidade | Classe RAP de origem |
|---|---|---|
| `util` | CPF, e-mail, telefone, imagens, SKU, endereço, arredondamento | `ZCL_PC_UTIL` |
| `viacep` | Consulta ao ViaCEP com cache por processo (100 CEPs) e timeout | `ZCL_PC_VIACEP` |
| `enderecos` | Preenchimento pelo CEP e validações do Save | BO Cliente |
| `numeracao` | Sequenciais de pedido e SKU | `ZCL_PC_NUMERACAO` |
| `estoque` | Reserva, liberação e baixa com `UPDATE` condicional | BO Item |
| `pedidos` | Registro, edição, snapshots, cancelamento, reembolso, pagamento | `ZBP_R_PC_PEDIDO` |
| `pagamento-simulado` | Simulação do cartão | `ZCL_PC_PAGAMENTO_SIM` |
| `planilha` | Leitor de `.xlsx` (ZIP + XML, sem bibliotecas) e `.csv` | `ZCL_PC_PLANILHA` |
| `importacao*` | Importações de clientes, estoque e pedidos | `ZCL_PC_IMPORTACAO` |
| `mensagens`, `requisicao` | Atalhos de mensagens e leitura de chave/rascunho/upload | — |

---

## 8. Ciclo de Vida do Pedido

### 8.1 Status do pedido

| Status | Descrição |
|---|---|
| *(rascunho)* | Pedido em elaboração, sem número e sem reserva de estoque. |
| `ABERTO` | Registrado no primeiro Salvar: número gerado, preços fixados, estoque reservado. Itens editáveis. |
| `AGUARDANDO_APROVACAO` | Pagamento aprovado; estoque ainda reservado; aguarda aprovação. |
| `PROCESSANDO_REEMBOLSO` | Cancelamento de pedido pago solicitado; aguarda decisão do reembolso. Estoque segue reservado. |
| `FINALIZADO` | Estoque baixado, snapshots gerados, pedido imutável. |
| `CANCELADO` | Reserva liberada, snapshots gerados, pedido imutável. |

### 8.2 Status do pagamento (`Pedidos.statusPagamento`)

`PENDENTE` (sem tentativa) → `RECUSADO` ou `APROVADO` (a cada tentativa) → `DEVOLVIDO` (reembolso aprovado).

### 8.3 Transições

```text
rascunho ──Salvar──▶ ABERTO ──pagamento aprovado──▶ AGUARDANDO_APROVACAO ──aprovar──▶ FINALIZADO
                      │  ▲ pagamento recusado (fica ABERTO)        │
                      │                                            └──cancelar──▶ PROCESSANDO_REEMBOLSO
                      └──cancelar──▶ CANCELADO                                       │
                                        ▲                                            │
                                        └──────────── reembolso aprovado ◀───────────┤
                                     AGUARDANDO_APROVACAO ◀── reembolso rejeitado ───┘
```

| Origem | Destino | Gatilho | Efeitos |
|---|---|---|---|
| rascunho | `ABERTO` | Salvar (draftActivate) | Valida, gera número, fixa preços, calcula total, reserva estoque |
| `ABERTO` | `ABERTO` | Editar + Salvar | Ajusta a reserva pela diferença |
| `ABERTO` | `ABERTO` | `efetuarPagamento` recusado | Pagamento `RECUSADO`; nova tentativa permitida |
| `ABERTO` | `AGUARDANDO_APROVACAO` | `efetuarPagamento` aprovado | Pagamento `APROVADO` |
| `AGUARDANDO_APROVACAO` | `FINALIZADO` | `aprovarPedido` | Baixa estoque, snapshots `FINALIZACAO`, `dataFinalizacao` |
| `ABERTO` | `CANCELADO` | `cancelarPedido` (sem pagamento aprovado) | Libera reserva, snapshots `CANCELAMENTO`, dados do cancelamento |
| `AGUARDANDO_APROVACAO` | `PROCESSANDO_REEMBOLSO` | `cancelarPedido` (pagamento aprovado) | Cria `Reembolsos` `PENDENTE`; reserva mantida |
| `PROCESSANDO_REEMBOLSO` | `CANCELADO` | `aprovarReembolso` | Libera reserva, snapshots, pagamento `DEVOLVIDO` |
| `PROCESSANDO_REEMBOLSO` | status anterior | `rejeitarReembolso` | Retoma o status anterior e limpa o motivo do cancelamento |
| `FINALIZADO` / `CANCELADO` | — | qualquer | Bloqueado: pedido imutável |

### 8.4 Ações disponíveis por status

| Status | Editar | Efetuar Pagamento | Aprovar pedido | Cancelar pedido | Excluir |
|---|:---:|:---:|:---:|:---:|:---:|
| rascunho | Sim | Não | Não | Não | Descartar |
| `ABERTO` | Sim (somente itens) | Sim | Não (pagamento pendente) | Sim | Não |
| `AGUARDANDO_APROVACAO` | Não | Não | Sim | Sim (abre reembolso) | Não |
| `PROCESSANDO_REEMBOLSO` | Não | Não | Não | Não | Não |
| `FINALIZADO` | Não | Não | Não | Não | Não |
| `CANCELADO` | Não | Não | Não | Não | Não |

As ações só executam sobre o pedido **ativo** e sem rascunho de edição em andamento
(`ACAO_SOMENTE_ATIVO`, `PEDIDO_EM_EDICAO`). O pedido registrado nunca é excluído: é cancelado.

---

## 9. Regras de Negócio

### 9.1 Clientes

- Cadastro e edição com rascunho; o cliente nasce ativo e com score sorteado (0–100), que a UI não altera.
- CPF e telefone são gravados só com dígitos; e-mail em minúsculas.
- No Save: CPF com dígitos verificadores válidos (rejeita sequências repetidas) e único.
- Inativação pela edição do campo `clienteAtivo` (somente `Admin`); não há action específica.
- Exclusão bloqueada se houver qualquer pedido do cliente, gravado ou em rascunho (`CLIENTE_COM_PEDIDO`).
- Foto: JPEG, PNG ou WEBP — MIME, extensão e assinatura binária precisam ser coerentes.

### 9.2 Endereços

- Editados no rascunho do cliente; o **primeiro** endereço vira principal automaticamente.
- Ao informar o CEP, o backend preenche logradouro, bairro, cidade, UF e estado:
  1. se o CEP já foi validado em outro endereço (e não é CEP geral), reaproveita os dados sem chamar o ViaCEP;
  2. senão consulta o ViaCEP (`cds.requires.viacep.credentials.url`, timeout de 5 s, cache por processo).
- CEP inexistente grava `cepStatus = 'I'` e bloqueia o Save (`CEP_INVALIDO`).
- ViaCEP indisponível grava `cepStatus = 'X'`, avisa na hora e bloqueia o Save (`CEP_INDISPONIVEL`).
- **CEP geral** (município sem logradouro): logradouro e bairro passam a ser editáveis e obrigatórios.
- Cidade, UF, estado, `cepGeral`, `cepStatus` e `principal` nunca vêm da UI.
- Número obrigatório; o mesmo CEP não pode se repetir no mesmo cliente (`CEP_DUPLICADO_CLIENTE`).
- A action *Definir como principal* (no rascunho ou no ativo) desmarca os demais endereços do cliente.
- O CEP de um endereço gravado pode ser alterado (a chave é o `ID`).

### 9.3 Itens e estoque

- Cadastro e edição com rascunho; o item nasce ativo, em BRL, com estoque 0 e reserva 0.
- `qtdeDisponivel` e `statusEstoque` são colunas geradas pelo banco: sempre coerentes e filtráveis,
  sem rotina de recálculo.
- `qtdeReservada` só é alterada pelos pedidos; o Save do item ignora o valor recebido e não
  sobrescreve reservas feitas enquanto o item estava em edição.
- Inativação (`itemAtivo = false`) bloqueada se houver estoque disponível ou pedido ativo
  (`ABERTO`, `AGUARDANDO_APROVACAO`, `PROCESSANDO_REEMBOLSO`) ou em rascunho com o item.
- Exclusão bloqueada se houver reserva ou qualquer pedido (gravado ou em rascunho) com o item.
- Foto: mesmas regras da foto do cliente.

### 9.4 SKU

- Formato `SKU-<prefixo>-<sequencial>`, ex.: `SKU-ELE-0000000042`.
- Prefixo: 3 primeiras letras do código da categoria em maiúsculas (completado com `X` se menor).
- Sequencial: 10 dígitos, objeto `SKU` de `Numeracoes` (único para todo o estoque).
- Gerado no Save do item novo; **regenerado** quando a categoria muda de prefixo; mantido nos demais casos.

### 9.5 Pedidos

**Rascunho**

- Nasce com status `ABERTO` (provisório), pagamento `PENDENTE`, moeda BRL e total 0.
- Ao escolher o cliente, o endereço principal é preenchido (side effect na tela); cliente sem
  endereço principal gera aviso.
- Nova linha nasce com quantidade 1. Ao escolher o item ou a quantidade, o backend calcula o preço
  provisório (preço já fixado no pedido, se o item já fazia parte dele) e o total da linha; o total
  do pedido é recalculado a cada inclusão, alteração ou exclusão de linha.
- Item sem estoque disponível é barrado ao ser incluído (`ITEM_SEM_ESTOQUE`), salvo se já estava no pedido.
- O rascunho **não** reserva estoque.

**Registro (primeiro Salvar) — também usado pela importação**

1. cliente obrigatório, existente e ativo, com endereço principal;
2. ao menos um item; itens existentes e ativos, quantidade `> 0`, moeda BRL;
3. a soma pedida por item cabe no disponível atual;
4. fixa o preço de cada linha, calcula os totais;
5. preenche status `ABERTO`, pagamento `PENDENTE`, endereço e número do pedido;
6. reserva o estoque (seção 10). Qualquer erro desfaz tudo.

**Edição do pedido `ABERTO`**

- Só os itens mudam; o cliente é imutável (`PEDIDO_CLIENTE_IMUTAVEL`).
- O Save compara a nova composição com a reserva atual: reserva o acréscimo, libera o excedente e a
  reserva de itens removidos. Item inativo só barra itens novos ou com quantidade maior.
- Itens que já estavam no pedido mantêm o preço fixado; itens novos usam o preço atual.
- Edição bloqueada fora do status `ABERTO` (`PEDIDO_EDICAO_BLOQUEADA`).

### 9.6 Pagamento simulado

- Só no status `ABERTO` (inclusive após recusa).
- Dados do cartão usados apenas em memória: nunca persistidos, retornados ou registrados.
- Dados inválidos são **erro de entrada** (HTTP 400, `CARTAO_DADOS_INVALIDOS`), não recusa:
  método fora da lista, número com menos de 13 ou mais de 19 dígitos, validade fora do formato
  `MM/AA`, mês inválido, cartão expirado (o mês corrente ainda vale) ou CVV sem 3 ou 4 dígitos.
- Bandeira: número iniciado em 4 → `VISA`; em 5 → `MASTERCARD`; demais → `OUTRA`.
- CVV `000` → `RECUSADO` (pedido continua `ABERTO`); demais → `APROVADO` com código `SIMnnnnnn`
  (pedido vai para `AGUARDANDO_APROVACAO`).
- A cada tentativa o registro de `Pagamentos` do pedido é substituído (só a última é mantida).

### 9.7 Aprovação

- Só em `AGUARDANDO_APROVACAO` com pagamento `APROVADO` (`PEDIDO_PAGAMENTO_PENDENTE`).
- Baixa `qtdeEstoque` e `qtdeReservada` dos itens, gera os snapshots (`FINALIZACAO`), preenche
  `dataFinalizacao` e muda o status para `FINALIZADO`.

### 9.8 Cancelamento

- Permitido em `ABERTO` e `AGUARDANDO_APROVACAO`; motivo obrigatório (`PEDIDO_MOTIVO_CANCEL_OBRIG`).
- **Sem pagamento aprovado**: libera toda a reserva, gera snapshots (`CANCELAMENTO`), preenche
  `motivoCancelamento`, `dataCancelamento`, `canceladoPor` e muda para `CANCELADO`.
- **Com pagamento aprovado**: cria a solicitação de reembolso `PENDENTE` (com o status anterior, o
  valor e o motivo), guarda o motivo no pedido e muda para `PROCESSANDO_REEMBOLSO`. A reserva continua.

### 9.9 Reembolsos

- As solicitações nascem do cancelamento; a aplicação só consulta e decide.
- **Aprovar** (motivo opcional): libera a reserva, gera snapshots, cancela o pedido, marca o
  pagamento do pedido e o registro de `Pagamentos` como `DEVOLVIDO` e grava a decisão.
- **Rejeitar** (motivo obrigatório): o pedido volta ao status anterior e o motivo do cancelamento é limpo.
- Cada solicitação é decidida uma única vez (`REEMBOLSO_STATUS_INVALIDO`); a decisão registra
  `dataDecisao` e `decididoPor`.

---

## 10. Reserva, Baixa, Liberação e Concorrência de Estoque

| Movimento | Quando | Efeito | Condição avaliada no banco |
|---|---|---|---|
| Reservar | Registro do pedido; acréscimo na edição | `qtdeReservada += q` | item ativo e `qtdeEstoque - qtdeReservada >= q` |
| Liberar | Redução/remoção na edição; cancelamento; reembolso aprovado | `qtdeReservada -= q` | `qtdeReservada >= q` |
| Baixar | Aprovação | `qtdeReservada -= q`, `qtdeEstoque -= q` | `qtdeReservada >= q` e `qtdeEstoque >= q` |

**Concorrência:** cada movimento é um único `UPDATE` condicional e atômico (`UPDATE Itens SET ...
WHERE ID = ? AND <condição>`). A condição usa o saldo **atual** do banco, nunca valores da UI. Se
outra transação consumiu o saldo, nenhuma linha é alterada e o pedido recebe
`ITEM_ESTOQUE_INSUFICIENTE`, `ITEM_INATIVO`, `ITEM_RESERVA_INCONSISTENTE` ou
`ITEM_ESTOQUE_CONCORRENTE`. Como toda a requisição roda numa transação, qualquer erro desfaz também
os movimentos já aplicados, o número do pedido e os snapshots — não há dupla reserva, dupla baixa
ou dupla liberação.

| Status do estoque | Regra |
|---|---|
| `SEM_ESTOQUE` | `qtdeDisponivel <= 0` |
| `ACABANDO` | `1 <= qtdeDisponivel <= 10` |
| `EM_ESTOQUE` | `qtdeDisponivel >= 11` |

---

## 11. Cálculos

```text
ItensPedido.valorTotal = arredondar(qtdeItemPedido × precoUnitarioSnapshot, 2)
Pedidos.valorTotal     = arredondar(Σ ItensPedido.valorTotal, 2)
Itens.qtdeDisponivel   = qtdeEstoque − qtdeReservada            (coluna gerada)
ItensAnalise.valorEstoque = precoUnitario × qtdeEstoque
```

Todos os valores definitivos são calculados no backend; os valores enviados pela UI são ignorados.

---

## 12. Snapshots e Histórico

- Criados uma única vez, na aprovação (`FINALIZACAO`) ou no cancelamento (`CANCELAMENTO`, inclusive
  por reembolso aprovado). Tentativa de recriar apenas informa `SNAPSHOT_EXISTENTE`.
- `PedidosClienteSnapshots` congela cliente e endereço; `PedidosItensSnapshots` congela cada item.
- São somente leitura em todos os serviços.
- Na Object Page de um pedido encerrado, as seções "Dados do Cliente" e "Itens" passam a mostrar os
  snapshots (indicadores `encerrado`/`naoEncerrado`), então alterações posteriores no cadastro não
  mudam o histórico.

---

## 13. Importação por Planilha

Botão **Importar planilha** nas listas de Clientes, Estoque e Pedidos (extensão
`webapp/ext/ImportarPlanilha.js`), que chama a action `importarPlanilha` do serviço.

### 13.1 Regras gerais

- Formatos: `.xlsx` (inclusive gerado pelo LibreOffice, com textos compartilhados ou *inline*) e
  `.csv` (separador `;`, `,` ou tabulação; UTF-8 com ou sem BOM, ou Windows-1252). `.xls` é recusado.
- A primeira linha não vazia é o cabeçalho; nomes de coluna comparados sem acento, espaço,
  pontuação ou caixa; cada coluna aceita sinônimos; colunas extras são ignoradas.
- Máximo de 500 linhas de dados.
- **Tudo ou nada**: todas as linhas são validadas antes de gravar; com qualquer erro nada é gravado
  e a resposta lista até 15 erros por linha (mais o total omitido).
- A gravação passa pelo próprio serviço, então valem as mesmas regras da tela (ViaCEP, SKU, reserva...).
- Modelos prontos em [`modelos-importacao`](modelos-importacao) (`.xlsx` e `.csv`).

### 13.2 Colunas

| Planilha | Colunas obrigatórias | Opcionais | Particularidades |
|---|---|---|---|
| Clientes (`Admin`) | CPF, Nome, E-mail, Telefone, Data de nascimento, CEP, Número | Gênero, Complemento | Um cliente por linha com o endereço principal; CPF sem zeros à esquerda é completado; CEP com 5–7 dígitos é completado; data `AAAA-MM-DD`, `DD/MM/AAAA` ou data do Excel; gênero pelo código ou pelo texto; CPF repetido na planilha ou já cadastrado é erro |
| Estoque (`Admin`) | Nome, Categoria, Quantidade em estoque, Preço unitário | Descrição, Moeda (padrão BRL) | Item criado ativo com SKU; nome já cadastrado ou repetido é erro (evita duplicar estoque ao reenviar); preço aceita `1.234,56`, `1234.56` e `R$` |
| Pedidos (`Comum`/`Admin`) | Pedido (referência), CPF, SKU, Quantidade | Observação | Linhas com a mesma referência formam um pedido; cliente ativo com endereço principal; itens ativos; o disponível precisa cobrir a soma da planilha inteira; cada pedido nasce `ABERTO` com reserva; a referência é gravada no pedido e a mesma referência para o mesmo cliente é recusada enquanto houver pedido não cancelado com ela (reenviar a planilha não duplica pedidos); referência com até 40 caracteres |

---

## 14. Camada Analítica

`AnaliticoService` expõe quatro visões somente leitura com dimensões e medidas. As medidas têm
agregação padrão (`@Aggregation.default`) e são *custom aggregates*, então o cliente usa
`$apply=groupby((dimensão),aggregate(medida))` sem informar o método.

| Visão | Dimensões | Medidas |
|---|---|---|
| `PedidosAnalise` | número, status do pedido, status do pagamento, UF, mês de criação (`AAAAMM`), moeda | `valorTotal` (soma), `valorMedio` (média), `qtdePedidos` |
| `ClientesAnalise` | nome, gênero, ativo, UF, faixa de score (`BAIXO` < 40, `MEDIO` ≤ 70, `ALTO`), mês de cadastro | `qtdeClientes`, `scoreMedio` (média) |
| `ItensAnalise` | SKU, nome, categoria, status do estoque, ativo, moeda | `qtdeEstoque`, `qtdeReservada`, `qtdeDisponivel`, `valorEstoque`, `qtdeItens` |
| `ReembolsosAnalise` | número, status, motivo, UF, mês da solicitação, moeda | `valorReembolso`, `qtdeReembolsos` |

O app freestyle **Análises de Compras** oferece 20 análises (5 por domínio), com KPIs, gráfico
(colunas ou rosca), tabela, filtros e detalhe:

| Domínio | Análises |
|---|---|
| Pedidos | valor por status; quantidade por mês; valor por UF; quantidade por status de pagamento; ticket médio por status |
| Clientes | por gênero; por UF; por faixa de score; cadastros por mês; score médio por UF |
| Estoque | reservado × disponível por categoria; itens por situação; valor por categoria; 10 mais reservados; itens por categoria |
| Reembolsos | valor por status; quantidade por status; valor por mês; valor por UF; quantidade por motivo |

---

## 15. Interface do Usuário

### 15.1 Aplicações

| Aplicação | Tipo | Caminho | Serviço |
|---|---|---|---|
| Gestão de Clientes | Fiori Elements V4 — List Report/Object Page | `/gestaoclientes/index.html` | `ClientesService` |
| Gestão de Estoque | Fiori Elements V4 — List Report/Object Page | `/gestaoestoque/index.html` | `EstoqueService` |
| Pedidos de Compras | Fiori Elements V4 — List Report/Object Page | `/pedidoscompras/index.html` | `PedidosService` |
| Gestão de Reembolsos | Fiori Elements V4 — List Report/Object Page | `/gestaoreembolsos/index.html` | `ReembolsosService` |
| Análises de Compras | SAPUI5 freestyle | `/analisecompras/index.html` | `AnaliticoService` |
| Launchpad local | Sandbox do SAP Fiori launchpad | `/launchpad.html` | — |

O launchpad tem um tile por aplicação. Os *intents* (`Cliente-manage`, `ItemEstoque-manage`,
`PedidoCompra-manage`, `Reembolso-manage`, `AnaliseCompras-display`) são os mesmos dos *inbounds*
dos manifests, o que habilita a navegação entre apps (ex.: cliente e item do pedido abrem as apps de
Clientes e Estoque).

### 15.2 Listas e filtros

| App | Colunas | Filtros |
|---|---|---|
| Clientes | Foto, CPF, Nome, E-mail, Telefone, Ativo, Cidade, UF, Criado em, Score (barra colorida) | Nome, CPF, E-mail, Ativo, Cidade, UF |
| Estoque | Foto, SKU, Nome, Categoria, Estoque, Reservada, Disponível, Status (colorido), Preço, Ativo | SKU, Nome, Categoria, Status, Ativo, Disponível |
| Pedidos | Número, CPF, Cliente, Status do pedido, Status do pagamento, Total, Criado em, Finalizado em | Cliente, CPF, Status do pedido, Status do pagamento, Data, Total |
| Reembolsos | Número do pedido, Cliente, Status, Valor, Motivo, Data da solicitação, Motivo da decisão | Número do pedido, Cliente, Status |

### 15.3 Object Page do pedido

- Cabeçalho com status do pedido, status do pagamento e total; botões *Efetuar Pagamento*,
  *Aprovar pedido* e *Cancelar pedido* habilitados conforme o status (seção 8.4).
- Seções: Dados do Cliente, Dados do Pedido, Itens, Pagamento (última tentativa), Finalização
  (só `FINALIZADO`) e Cancelamento (só `CANCELADO`).
- Pedido encerrado: Dados do Cliente e Itens vêm dos snapshots.
- O usuário informa apenas o **Cliente** (só na criação) e os itens. CPF, e-mail, telefone, gênero,
  nascimento e endereço de entrega são preenchidos automaticamente pela associação `cliente` e são
  somente leitura (`@Core.Computed`); os demais campos do pedido são mantidos pelo backend.
- A seção Pagamento é somente leitura (`Pagamentos` é `@readonly` no `PedidosService`): só a ação
  *Efetuar Pagamento* grava o pagamento, e a edição dos itens não o altera.
- *Editar* só aparece em `ABERTO`; *Excluir* nunca aparece para o pedido registrado.
- Side effects: trocar o cliente recarrega endereço e dados do cliente; alterar item ou quantidade
  recarrega preço, total da linha e total do pedido.

---

## 16. Mensagens

Arquivo `_i18n/messages.properties` (porte da message class `ZPC_MSG`). Parâmetros nomeados entre chaves.

| Chave | Mensagem |
|---|---|
| `CLIENTE_CPF_INVALIDO` | CPF inválido. Verifique o número informado. |
| `CLIENTE_CPF_DUPLICADO` | Já existe um cliente cadastrado com este CPF. |
| `CLIENTE_INATIVO` | Cliente inativo não pode realizar pedido. |
| `CLIENTE_COM_PEDIDO` | Cliente não pode ser excluído pois possui pedido vinculado. |
| `CLIENTE_SEM_ENDERECO_PRINCIPAL` | Cliente selecionado não possui endereço principal válido. |
| `CEP_INDISPONIVEL` | Não foi possível validar o CEP agora. Tente novamente em instantes. |
| `CEP_INVALIDO` | CEP inválido ou não encontrado. Verifique o número informado. |
| `CEP_DUPLICADO_CLIENTE` | Já existe um endereço cadastrado com este CEP para este cliente. |
| `ENDERECO_NUMERO_OBRIGATORIO` | Número do endereço é obrigatório. |
| `FOTO_FORMATO_INVALIDO` | Formato de imagem inválido. Utilize JPEG, PNG ou WEBP. |
| `EMAIL_INVALIDO` | E-mail em formato inválido. |
| `TELEFONE_INVALIDO` | Telefone deve conter 10 ou 11 dígitos (DDD + número). |
| `DATA_NASCIMENTO_FUTURA` | Data de nascimento não pode ser futura. |
| `CAMPO_OBRIGATORIO` | Campo {campo} é obrigatório. |
| `VALOR_INVALIDO` | Valor inválido para o campo {campo}. |
| `ITEM_SKU_DUPLICADO` | Já existe item cadastrado com este SKU. |
| `ITEM_ESTOQUE_INSUFICIENTE` | Estoque insuficiente para o item {sku} (disponível: {disponivel}). |
| `ITEM_ESTOQUE_CONCORRENTE` | Estoque do item {sku} alterado por outra operação. Atualize e tente de novo. |
| `ITEM_INATIVO` | Item {sku} inativo não pode ser usado em novo pedido. |
| `ITEM_SEM_ESTOQUE` | Item {sku} está sem estoque disponível e não pode ser adicionado ao pedido. |
| `ITEM_INATIVACAO_BLOQUEADA` | Item possui estoque disponível ou pedido ativo. Inativação bloqueada. |
| `ITEM_EXCLUSAO_BLOQUEADA` | Item não pode ser excluído pois está vinculado a pedido ou reserva. |
| `ITEM_QTDE_INVALIDA` | Quantidade do item deve ser maior que zero. |
| `ITEM_PRECO_INVALIDO` | Preço unitário deve ser maior ou igual a zero. |
| `ITEM_QTDE_ESTOQUE_INVALIDA` | Quantidade em estoque não pode ser negativa nem menor que a reservada. |
| `ITEM_RESERVA_INCONSISTENTE` | Reserva do item {sku} inconsistente com o pedido. |
| `PEDIDO_SEM_ITENS` | Pedido deve possuir ao menos um item. |
| `PEDIDO_CONFIRMADO` | Pedido {numero} registrado. Estoque reservado. |
| `PEDIDO_ATUALIZADO` | Pedido {numero} atualizado. Reserva de estoque ajustada. |
| `PEDIDO_EDICAO_BLOQUEADA` | Pedido só pode ser editado no status ABERTO. |
| `PEDIDO_EXCLUSAO_BLOQUEADA` | Pedido registrado não pode ser excluído. Utilize Cancelar pedido. |
| `PEDIDO_CLIENTE_IMUTAVEL` | O cliente de um pedido registrado não pode ser alterado. |
| `PEDIDO_EM_EDICAO` | Pedido {numero} está em edição. Salve ou descarte o rascunho antes de executar esta ação. |
| `ACAO_SOMENTE_ATIVO` | Esta ação só pode ser executada sobre o pedido salvo (fora do modo de edição). |
| `PEDIDO_STATUS_INVALIDO` | Transição de status não permitida (status atual: {status}). |
| `PEDIDO_PAGAMENTO_PENDENTE` | Pagamento pendente. O pedido não pode ser finalizado. |
| `PEDIDO_FINALIZADO` | Pedido {numero} finalizado com sucesso. |
| `PEDIDO_FINALIZADO_IMUTAVEL` | Pedido finalizado não pode ser alterado. |
| `PEDIDO_CANCELADO` | Pedido {numero} cancelado. |
| `PEDIDO_CANCELADO_IMUTAVEL` | Pedido cancelado não pode ser alterado. |
| `PEDIDO_MOTIVO_CANCEL_OBRIG` | Informe o motivo do cancelamento. |
| `PEDIDO_REEMBOLSO_SOLICITADO` | Pedido {numero} enviado para processamento de reembolso. |
| `CARTAO_DADOS_INVALIDOS` | Dados do cartão inválidos: {erro}. |
| `PAGAMENTO_APROVADO` | Pagamento aprovado com sucesso. |
| `PAGAMENTO_RECUSADO` | Pagamento recusado. O pedido permanecerá aguardando pagamento. |
| `SNAPSHOT_EXISTENTE` | Snapshot do pedido já foi gerado e não pode ser recriado. |
| `REEMBOLSO_APROVADO` | Reembolso do pedido {numero} aprovado. Pedido cancelado. |
| `REEMBOLSO_REJEITADO` | Reembolso do pedido {numero} rejeitado. Pedido retomado. |
| `REEMBOLSO_STATUS_INVALIDO` | Solicitação de reembolso não está mais pendente. |
| `REEMBOLSO_MOTIVO_DECISAO_OBRIG` | Informe o motivo da decisão sobre o reembolso. |
| `IMPORTACAO_CONCLUIDA` | Importação concluída: {quantidade} registro(s) criado(s). |
| `IMPORTACAO_CANCELADA` | Importação cancelada: nenhum registro foi gravado ({quantidade} erro(s)). |
| `IMPORTACAO_DETALHE` | {texto} (erro de uma linha da planilha) |
| `SEM_AUTORIZACAO` | Usuário sem autorização para esta operação. |

---

## 17. Critérios de Aceite

Cada critério tem teste automatizado correspondente (seção 20).

### 17.1 Clientes e endereços

- Dado um `Admin`, quando criar um cliente com CPF válido e único e um endereço com CEP válido,
  então o endereço é preenchido pelo ViaCEP, vira principal, e o cliente é salvo ativo, com score
  entre 0 e 100, e-mail em minúsculas e CPF/telefone formatados para exibição.
- Dado um CEP já cadastrado, quando informado em outro endereço, então o ViaCEP não é consultado.
- Dado um CPF inválido ou já cadastrado, quando salvar, então o Save é bloqueado.
- Dado e-mail inválido, telefone fora de 10/11 dígitos ou nascimento futuro, quando salvar, então o Save é bloqueado.
- Dado um CEP inexistente ou o ViaCEP indisponível, quando salvar, então o Save é bloqueado.
- Dado um CEP geral, então logradouro e bairro ficam editáveis e obrigatórios.
- Dado um endereço sem número ou dois endereços com o mesmo CEP, quando salvar, então o Save é bloqueado.
- Dado dois endereços, quando *Definir como principal* for executado em um deles (rascunho ou ativo), então só ele fica principal.
- Dado um usuário `Comum`, quando tentar criar ou editar cliente, então recebe HTTP 403.
- Dado um cliente com pedido, quando excluído, então a exclusão é bloqueada; sem pedido, é excluído.
- Dado um upload de foto cuja assinatura não confere com o MIME, então é recusado.

### 17.2 Estoque

- Dado um item novo, quando salvo, então recebe SKU `SKU-<CAT>-<10 dígitos>` único, ativo e em BRL.
- Dado um item, quando a categoria muda de prefixo, então o SKU é regenerado; senão é mantido.
- Dado estoque 0, 10 e 11 sem reserva, então o status é `SEM_ESTOQUE`, `ACABANDO` e `EM_ESTOQUE`.
- Dado preço negativo ou estoque menor que a reserva, quando salvar, então o Save é bloqueado.
- Dado um item em edição, quando um pedido reservar unidades no meio tempo, então o Save do item preserva a reserva.
- Dado um item com estoque disponível, quando inativado, então é bloqueado; sem estoque e sem pedido, é permitido.
- Dado um item vinculado a pedido, quando excluído, então é bloqueado; item livre é excluído.

### 17.3 Pedidos

- Dado um rascunho, então nenhuma reserva é feita e o total provisório é calculado.
- Dado um rascunho válido, quando salvo, então o pedido fica `ABERTO`, com número de 10 dígitos, pagamento `PENDENTE` e estoque reservado.
- Dado quantidade acima do disponível ou pedido sem itens, quando salvo, então nada é registrado nem reservado.
- Dado um item sem estoque, quando incluído no rascunho, então é barrado na hora.
- Dado um pedido `ABERTO`, quando itens forem aumentados, incluídos, reduzidos ou removidos, então a reserva é ajustada pela diferença.
- Dado um pedido registrado, quando o cliente for trocado, então a operação é bloqueada.
- Dado um pedido `FINALIZADO`, quando editado ou excluído, então a operação é bloqueada.

### 17.4 Pagamento, aprovação e cancelamento

- Dado um pedido `ABERTO`, quando o pagamento for recusado (CVV 000), então continua `ABERTO`; quando aprovado, vai para `AGUARDANDO_APROVACAO`.
- Dado qualquer tentativa, então só o resultado seguro da última é gravado e nada sensível aparece.
- Dado um cartão expirado, então a resposta é erro de dados, não recusa.
- Dado um pedido sem pagamento aprovado, quando aprovado, então é bloqueado; com pagamento aprovado, o estoque é baixado, os snapshots gerados e o pedido `FINALIZADO`.
- Dado um pedido sem pagamento aprovado, quando cancelado com motivo, então a reserva é liberada, os snapshots gerados e o pedido `CANCELADO`; sem motivo, é bloqueado.
- Dado um pedido pago, quando cancelado, então vai para `PROCESSANDO_REEMBOLSO`, mantém a reserva e cria o reembolso `PENDENTE`.
- Dado um pedido em edição ou um rascunho, quando uma ação for executada, então é bloqueada.

### 17.5 Reembolsos

- Dado um reembolso pendente, quando aprovado, então o pedido é cancelado, a reserva liberada, os snapshots gerados e o pagamento `DEVOLVIDO`.
- Dado um reembolso pendente, quando rejeitado com motivo, então o pedido volta a `AGUARDANDO_APROVACAO`; sem motivo, é bloqueado.
- Dado um reembolso já decidido, quando decidido de novo, então é bloqueado.

### 17.6 Importação e análises

- Dada uma planilha válida, então todos os registros são criados; com qualquer erro, nada é gravado e os erros são listados por linha.
- Dada uma planilha de pedidos cuja demanda total excede o disponível, então a importação é cancelada.
- Dado um `Comum`, quando importar clientes ou estoque, então recebe HTTP 403.
- Os modelos de `docs/modelos-importacao` importam sem erro.
- As agregações `$apply` respondem nos quatro domínios, e a contagem de pedidos da análise fecha com o total de pedidos do serviço transacional.

---

## 18. Segurança

- Autorização declarativa (`@requires`/`@restrict`) em todos os serviços; validações críticas no backend.
- Dados de cartão nunca persistidos, retornados ou registrados; só o resultado seguro é gravado.
- Campos controlados pelo backend (status, totais, número, reserva, score, endereço do pedido) ignoram valores da UI.
- Pedidos encerrados e snapshots são imutáveis; o pedido registrado é cancelado, nunca excluído.
- Exclusões de clientes e itens bloqueadas quando há vínculo com pedidos.
- Uploads de imagem validados por MIME, extensão e assinatura binária.
- Movimentos de estoque transacionais e atômicos.
- URL do ViaCEP configurável por ambiente (`cds_requires_viacep_credentials_url`), sem credenciais no código.

---

## 19. Implementações JavaScript e TypeScript

O repositório mantém duas implementações completas e equivalentes da mesma aplicação:

| Aspecto | `nodejs-padrao` | `nodejs-typescript` |
|---|---|---|
| Linguagem dos handlers | JavaScript ESM (`srv/*.js`, `srv/lib/*.js`) | TypeScript 6.0 `strict` (`srv/*.ts`, `srv/lib/*.ts`) |
| Acesso às entidades | `this.entities`, `cds.entities('pedidoscompras')` | Classes geradas pelo cds-typer, importadas de `#cds-models/...` |
| Consultas | `cds.ql` | `SELECT`/`INSERT`/`UPDATE`/`DELETE` globais tipados |
| Parâmetros de actions | `req.data` sem tipo | Tipos derivados do modelo (`typeof Pedido.actions.efetuarPagamento.__parameters`) |
| Nomes de tipos | — | Singulares definidos em `srv/typer.cds` (`@singular`) |
| Execução local | `cds watch` | `cds-tsx watch` (tsx) |
| Testes | `node --test` (`*.test.js`) | `node --import tsx --test` (`*.test.ts`, `CDS_TYPESCRIPT=tsx`) |
| Lint | ESLint (recomendado do CAP) | ESLint + `typescript-eslint` + `tsc --noEmit` |
| Build | `cds build` copia os `.js` | `cds build` compila com `tsc` (`tsconfig.cdsbuild.json`) para `gen/srv` |
| Gerador de dados | `scripts/gerar-dados-demo.js` | `scripts/gerar-dados-demo.ts` (gera os mesmos CSVs) |
| Modelo CDS, apps, dados, i18n | — | Idênticos |

Regra de manutenção: qualquer mudança de regra de negócio deve ser feita nas duas versões, com o
teste correspondente nas duas suítes.

### 19.1 Comandos

| Ação | `nodejs-padrao` | `nodejs-typescript` |
|---|---|---|
| Instalar | `npm install` | `npm install` |
| Executar | `npm run watch` | `npm run watch` |
| Testar | `npm test` | `npm test` |
| Lint | `npm run lint` | `npm run lint` (inclui verificação de tipos) |
| Gerar tipos | — | `npm run typer` |
| Build de produção | `cds build --production` | `npm run build` |
| Regenerar dados | `npm run dados:demo` | `npm run dados:demo` |

---

## 20. Testes Automatizados

68 testes por versão (`node:test` + `@cap-js/cds-test`), com um servidor ViaCEP falso local (sem
rede externa) e um gerador de `.xlsx` mínimo. São permanentes, como a suíte ABAP Unit do RAP.

| Arquivo | Cobertura | Classes de teste RAP equivalentes |
|---|---|---|
| `unidade.test` | CPF, e-mail, telefone, imagens, status de estoque, SKU, pagamento simulado, leitor XLSX/CSV | `ltcl_digitos_cpf`, `ltcl_email_imagem`, `ltcl_estoque_endereco`, testes de `ZCL_PC_PAGAMENTO_SIM` e `ZCL_PC_PLANILHA` |
| `clientes.test` | Rascunho, ViaCEP, CEP geral, CEP único, endereço principal, CPF, autorização, exclusão, foto | `ltcl_persistencia_endereco` |
| `estoque.test` | SKU, disponibilidade e status, concorrência com edição, inativação e exclusão | `ltcl_sku_item` |
| `pedidos.test` | Registro com reserva, edição pela diferença, pagamento, aprovação, cancelamento, reembolso, campos somente leitura (cliente e pagamento) | `ltcl_registro_pedido`, `ltcl_edicao_pedido`, `ltcl_ciclo_pedido` |
| `reembolsos.test` | Aprovar, rejeitar (motivo obrigatório), decisão única | `ltcl_reembolso` |
| `importacao.test` | Clientes, estoque e pedidos (tudo ou nada), reimportação de pedidos recusada e modelos de `docs/` | testes de `ZCL_PC_IMPORTACAO` |
| `analitico.test` | Agregações `$apply` dos quatro domínios | — |

---

## 21. Estrutura do Repositório

```text
sap-cap-nodejs-pedidos-de-compras-app/
├── docs/
│   ├── especificacao-tecnica.md      esta especificação
│   ├── especificacao-tecnica.docx    a mesma especificação em Word
│   └── modelos-importacao/           modelos .xlsx e .csv de clientes, estoque e pedidos
├── nodejs-padrao/                    implementação em JavaScript
└── nodejs-typescript/                implementação em TypeScript
```

Estrutura de cada implementação (as diferenças estão marcadas):

```text
├── _i18n/messages.properties         mensagens de negócio
├── app/
│   ├── common.cds                    rótulos, textos de CodeList, campos somente leitura
│   ├── services.cds                  reúne as anotações das apps
│   ├── gestao-clientes/              Fiori Elements (annotations.cds + webapp/, com webapp/ext/ImportarPlanilha.js)
│   ├── gestao-estoque/               Fiori Elements (+ importação)
│   ├── pedidos-compras/              Fiori Elements (+ importação)
│   ├── gestao-reembolsos/            Fiori Elements
│   ├── analise-compras/              SAPUI5 freestyle (20 análises)
│   ├── launchpad.html                sandbox do Fiori launchpad
│   └── launchpad/                    configuração e inicialização do launchpad
├── db/
│   ├── common.cds                    tipos e CodeLists
│   ├── schema.cds                    entidades
│   └── data/                         CodeLists e dados de demonstração (CSV)
├── srv/
│   ├── *-service.cds                 serviços (um por aplicação) + analitico-service.cds
│   ├── *-service.js | *.ts           handlers
│   ├── validacoes.cds                @mandatory / @assert
│   ├── typer.cds                     (só TypeScript) nomes dos tipos gerados
│   └── lib/                          regras de domínio
├── scripts/gerar-dados-demo.js | .ts gerador dos CSVs de demonstração
├── test/                             testes automatizados e apoio
├── tsconfig*.json                    (só TypeScript) verificação de tipos e build
└── package.json
```

---

## 22. Diferenças em Relação ao RAP e à Versão 1 desta Especificação

### 22.1 RAP (`ZAVBS_PC`) × CAP

| Tema | RAP | CAP |
|---|---|---|
| Numeração | Number Range Object `ZPC_NR` | Tabela `Numeracoes` com incremento atômico na transação |
| Disponível/status do estoque | Colunas mantidas por determinations | Colunas geradas (`stored`) no banco |
| Object Page dinâmica | Colunas `xfeld` persistidas (`AtualizarFlagsStatus`) | Elementos calculados na leitura |
| CEP do endereço | Chave da tabela, somente leitura após gravar | Chave é só o `ID`: o CEP pode ser alterado |
| Concorrência de estoque | Lock do BO Item via EML | `UPDATE` condicional atômico |
| Autorização | IAM App, objetos `ZPC_ADMIN`/`ZPC_PEDIDO`, `c_modo_trial` | Papéis `Admin`/`Comum` com `@requires`/`@restrict` |
| Leitor XLSX | XCO (sem `inlineStr`, recusa LibreOffice) | Leitor próprio (ZIP + XML), aceita ambos |

### 22.2 O que mudou da versão 1 para a 2 desta especificação

| Tema | Versão 1 (planejada) | Versão 2 (implementada) |
|---|---|---|
| Status do pedido | `CRIADO`, `AGUARDANDO_PAGAMENTO`, `AGUARDANDO_APROVACAO`, `FINALIZADO`, `CANCELADO` | `ABERTO`, `AGUARDANDO_APROVACAO`, `PROCESSANDO_REEMBOLSO`, `CANCELADO`, `FINALIZADO` |
| Registro do pedido | Action `confirmarPedido` | O Salvar do rascunho registra e reserva |
| Pagamento | Action `simularPagamentoPedido` (com nome do titular), retornando `Pagamentos` | Action `efetuarPagamento` (método, número, validade, CVV), retornando `Pedidos` |
| Cancelamento de pedido pago | Cancelava direto | Abre reembolso (`PROCESSANDO_REEMBOLSO`) e app Gestão de Reembolsos |
| Status do pagamento | `PENDENTE`, `APROVADO`, `RECUSADO` | + `DEVOLVIDO`; réplica em `Pedidos.statusPagamento` |
| Edição após reserva | Opcional (recomendação de bloquear) | Permitida em `ABERTO`, com ajuste pela diferença |
| Exclusão de pedido | Permitida em `CRIADO` | Pedido registrado nunca é excluído (só o rascunho é descartado) |
| SKU | `CCC-NNN-DDD-0001` (categoria, nome, descrição) | `SKU-<3 letras da categoria>-<10 dígitos>` |
| CodeLists | `StatusItensEstoque`, `StatusPedidos`, `StatusPagamentos` | `StatusEstoque`, `StatusPedido`, `StatusPagamento`, `StatusReembolso` |
| Calculados | `virtual` preenchidos em `after READ` | Elementos calculados no banco (`qtdeDisponivel`/`statusEstoque` `stored`) |
| Fotos | JPEG ou PNG | JPEG, PNG ou WEBP, com assinatura binária |
| Itens | Peso e dimensões | Não modelados |
| Endereço | `enderecoPrincipal` (Boolean) | `principal`, `cepGeral`, `cepStatus`, CEP geral e reaproveitamento de CEP |
| Papéis | `PedidosCompras.Comum`/`PedidosCompras.Admin`, usuários `Comum`/`Admin` | Papéis `Comum`/`Admin`, usuários `comum`/`admin` |
| Interface | App única com navegação interna | 5 apps independentes + launchpad com navegação entre elas |
| Novos recursos | — | Reembolsos, importação por planilha, camada analítica, dados de demonstração |
| Testes | Fora do escopo inicial | 68 testes automatizados por versão |
| Linguagem | Node.js | JavaScript e TypeScript |
| Estrutura | `srv/handlers`, `srv/utils`, `.cdsrc.json`, `mta.yaml`, `xs-security.json` | Um serviço por app, `srv/lib`, configuração no `package.json`; MTA e XSUAA pendentes |

---

## 23. Pendências e Backlog

**Implantação (pendente)**

- SAP HANA Cloud: `cds add hana` e perfil `[production]`. O modelo usa apenas funções portáveis do
  CAP (`substring`, `length`, `year`, `month`, `case`) e colunas geradas, suportadas pelo HANA, mas
  a execução no HANA ainda não foi testada.
- XSUAA (`xs-security.json` com os papéis `Admin` e `Comum`) e *role collections* na SAP BTP.
- Descritor MTA (`cds add mta`) e deploy no Cloud Foundry.
- Exposição das apps no SAP Build Work Zone.

**Evoluções futuras**

- Histórico completo de tentativas de pagamento.
- Auditoria de alterações críticas e logs estruturados.
- Monitoramento produtivo.
- Armazenamento externo de imagens.
- Integração real com gateway de pagamento e com serviço de frete.
- Estoque mínimo configurável por item.
- TypeScript 7 (compilador nativo) quando `typescript-eslint` e o plugin ESLint das apps Fiori o suportarem.
