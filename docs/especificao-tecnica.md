# Especificação Técnica Revisada - Sistema de Pedidos de Compras — SAP CAP + SAP Fiori Elements

## 1. Objetivo

Construir uma aplicação full stack de pedidos de compras com foco educacional, contemplando:

- gestão de clientes;
- gestão de endereços;
- gestão de estoque;
- criação, confirmação, pagamento simulado, aprovação/finalização e cancelamento de pedidos;
- reserva, baixa e liberação de estoque;
- preservação histórica por snapshots imutáveis.

**Fora do objetivo principal:** a aplicação não contemplará gestão de envio, logística, rastreamento de entrega ou integração real com gateways de pagamento.

### 1.1 Stack tecnológica

| Camada | Tecnologia/Serviço | Observações |
|---|---|---|
| Backend | SAP CAP com Node.js | Serviços OData, regras de negócio, actions e handlers. |
| Banco local | SQLite | Uso em desenvolvimento local. |
| Banco produção | SAP HANA Cloud | Uso em deploy na SAP BTP. |
| Frontend | SAP Fiori Elements | Padrão List Report/Object Page com extensões UI5 quando necessário. |
| Deploy | Cloud Foundry / MTA | Uso de `mta.yaml` para empacotamento e deploy. |
| Segurança | XSUAA + roles | Mocked auth em desenvolvimento e role collections na BTP Trial. |
| Portal | SAP Build Work Zone Standard Edition | Exposição da aplicação em launchpad/work zone. |

---

## 2. Escopo do Projeto

### 2.1 Incluído no escopo

- Cadastro, consulta, edição, ativação, inativação e exclusão controlada de clientes.
- Cadastro de múltiplos endereços por cliente, com apenas um endereço principal.
- Validação de CEP e preenchimento automático de endereço via API ViaCEP.
- Cadastro, consulta, edição, exclusão controlada e inativação controlada de itens do estoque.
- Controle de estoque com quantidade total, quantidade reservada e quantidade disponível.
- Criação de pedidos em draft.
- Confirmação de pedidos com reserva de estoque.
- Edição condicionada por status.
- Cancelamento de pedidos com liberação de reserva e motivo de cancelamento.
- Pagamento simulado com cartão de crédito ou débito, sem persistência de dados sensíveis.
- Nova tentativa de pagamento em caso de recusa, mantendo apenas os dados seguros da última tentativa.
- Aprovação/finalização de pedidos com baixa de estoque e geração de snapshots.
- Snapshots imutáveis dos dados de cliente, endereço e itens no momento da finalização ou cancelamento do pedido.
- Interface única com navegação interna usando SAP Fiori Elements no padrão **List Report/Object Page**.
- Controle de acesso por perfil: usuário comum e administrador.
- Controle de concorrência nas operações críticas de estoque.

### 2.2 Fora do escopo

- Gestão de entrega, frete real, transportadoras ou rastreamento.
- Integração real com gateway de pagamento.
- Armazenamento de dados sensíveis de cartão.
- Auditoria avançada de alterações.
- Logs técnicos avançados e monitoramento produtivo.
- Testes automatizados dentro do escopo inicial.
- Histórico completo de tentativas de pagamento.
- Uso por clientes reais.

---

## 3. Perfis de Usuário e Permissões

### 3.1 Usuário Comum

O usuário comum poderá:

- visualizar clientes cadastrados;
- visualizar itens cadastrados no estoque;
- criar pedidos;
- editar pedidos apenas enquanto o status permitir;
- confirmar pedidos;
- executar pagamento simulado;
- aprovar/finalizar pedidos;
- cancelar pedidos quando permitido pelo status.

O usuário comum **não poderá**:

- criar, editar, excluir, ativar ou inativar clientes;
- criar, editar, excluir, ativar ou inativar itens de estoque;
- editar pedidos finalizados ou cancelados;
- editar snapshots;
- alterar diretamente dados de pagamento persistidos.

### 3.2 Usuário Administrador

O usuário administrador poderá:

- executar todas as ações disponíveis ao usuário comum;
- criar, editar, ativar, inativar e excluir clientes, respeitando regras de integridade;
- criar, editar, ativar, inativar e excluir itens do estoque, respeitando regras de integridade.

O usuário administrador **não poderá**:

- editar pedidos finalizados ou cancelados;
- editar snapshots;
- persistir ou consultar dados sensíveis de cartão.

---

## 4. Autenticação e Autorização

Em desenvolvimento local, a aplicação utilizará autenticação mocked do CAP. Em produção na **SAP BTP Trial**, os usuários deverão ser adicionados ao subaccount e associados às respectivas roles/role collections.

### 4.1 Roles recomendadas

- `PedidosCompras.Comum`
- `PedidosCompras.Admin`

### 4.2 Exemplo conceitual de autenticação local

```json
{
  "cds": {
    "requires": {
      "[development]": {
        "auth": {
          "kind": "mocked",
          "users": {
            "Comum": {
              "password": "comum",
              "roles": ["Comum"]
            },
            "Admin": {
              "password": "admin",
              "roles": ["Admin"]
            }
          }
        }
      }
    }
  }
}
```

---

## 5. Padrão de Nomenclatura

A especificação adotará a seguinte padronização:

- entidades persistentes principais no plural;
- entidades auxiliares/CodeLists também no plural;
- entidades de relacionamento ou composição com nomes compostos descritivos;
- campos em `camelCase`;
- status e códigos em `UPPER_SNAKE_CASE`.

### 5.1 Entidades principais

| Entidade | Finalidade |
|---|---|
| `Clientes` | Cadastro de clientes. |
| `Enderecos` | Endereços vinculados a clientes. |
| `Itens` | Itens/produtos do estoque. |
| `Pedidos` | Cabeçalho e ciclo de vida do pedido. |
| `ItensPedido` | Itens selecionados enquanto o pedido está em fluxo. |
| `Pagamentos` | Resultado seguro da última tentativa de pagamento. |
| `PedidosClienteSnapshots` | Snapshot imutável dos dados do cliente/endereço no encerramento do pedido. |
| `PedidosItensSnapshots` | Snapshot imutável dos itens no encerramento do pedido. |

### 5.2 CodeLists

| Entidade | Finalidade |
|---|---|
| `Generos` | Lista de gêneros. |
| `Categorias` | Categorias de itens. |
| `StatusItensEstoque` | Status calculado do estoque. |
| `StatusPedidos` | Status do ciclo de vida do pedido. |
| `MetodosPagamento` | Métodos de pagamento permitidos. |
| `StatusPagamentos` | Status do pagamento simulado. |

---

## 6. Modelagem de Dados

> Observação: as entidades devem usar os aspects `cuid` e `managed` do CAP sempre que aplicável. Os campos `createdAt`, `createdBy`, `modifiedAt` e `modifiedBy` devem ser derivados de `managed`, evitando declaração manual desnecessária.

### 6.1 Entidade `Clientes`

| Campo | Tipo sugerido | Descrição/Regras |
|---|---|---|
| `id` | `cuid` | Chave primária gerenciada pelo CAP. |
| `fotoCliente` | `LargeBinary` | Armazena binários da imagem do cliente. |
| `fotoClienteMimeType` | `String(50)` | MIME type da foto. Será aceita apenas imagens do tipo `image/jpeg` ou `image/png`. |
| `fotoClienteNome` | `String(255)` | Nome original do arquivo da foto. |
| `cpf` | `String(11)` | CPF único, salvo apenas com números. |
| `nome` | `String(255)` | Nome completo. |
| `email` | `String(100)` | E-mail com formato válido. |
| `telefone` | `String(11)` | Telefone salvo apenas com números. |
| `genero` | `Association to Generos` | Gênero informado por CodeList. |
| `dataNascimento` | `Date` | Não pode ser data futura. |
| `clienteAtivo` | `Boolean default true` | Define se o cliente pode realizar pedidos. |
| `scoreCliente` | `Decimal(5,2)` | Score do cliente. |
| `enderecos` | `Composition of many Enderecos` | Cliente pode ter múltiplos endereços. |
| `enderecoPrincipalCompleto` | `virtual String(500)` | Exibe o endereço principal completo. |
| `telefoneFormatado` | `virtual String(15)` | Telefone com máscara para exibição. |
| `cpfFormatado` | `virtual String(14)` | CPF com máscara para exibição. |

#### Exemplo conceitual CDS

```cds
entity Clientes : cuid, managed {
  fotoCliente                 : LargeBinary;
  fotoClienteMimeType          : String(50);
  fotoClienteNome              : String(255);

  cpf                         : String(11);
  nome                        : String(255);
  email                       : String(100);
  telefone                    : String(11);
  genero                      : Association to Generos;
  dataNascimento              : Date;
  clienteAtivo                : Boolean default true;
  scoreCliente                : Decimal(5,2);

  enderecos                   : Composition of many Enderecos on enderecos.cliente = $self;
  enderecoPrincipalCompleto   : virtual String(500);
  telefoneFormatado           : virtual String(15);
  cpfFormatado                : virtual String(14);
}
```

### 6.2 Entidade `Enderecos`

| Campo | Tipo sugerido | Descrição/Regras |
|---|---|---|
| `id` | `cuid` | Chave primária gerenciada pelo CAP. |
| `cliente` | `Association to Clientes` | Cliente proprietário do endereço. |
| `cep` | `String(8)` | CEP salvo apenas com números. |
| `logradouro` | `String(150)` | Preenchido via ViaCEP e não editável manualmente. |
| `numero` | `String(20)` | Obrigatório. Endereço sem número não é permitido. |
| `complemento` | `String(100)` | Opcional. Pode ser informado pelo usuário. |
| `bairro` | `String(100)` | Preenchido via ViaCEP e não editável manualmente. |
| `cidade` | `String(100)` | Preenchido via ViaCEP e não editável manualmente. |
| `uf` | `String(2)` | Preenchido via ViaCEP e não editável manualmente. |
| `estado` | `String(100)` | Preenchido via ViaCEP e não editável manualmente. |
| `enderecoPrincipal` | `Boolean default false` | Apenas um endereço principal por cliente. |
| `cepFormatado` | `virtual String(9)` | CEP com máscara para exibição. |
| `enderecoCompleto` | `virtual String(500)` | Endereço completo concatenado. |

```cds
entity Enderecos : cuid, managed {
  cliente             : Association to Clientes;
  cep                 : String(8);
  logradouro          : String(150);
  numero              : String(20);
  complemento         : String(100);
  bairro              : String(100);
  cidade              : String(100);
  uf                  : String(2);
  estado              : String(100);
  enderecoPrincipal   : Boolean default false;

  cepFormatado        : virtual String(9);
  enderecoCompleto    : virtual String(500);
}
```

### 6.3 Entidade `Itens`

| Campo | Tipo sugerido | Descrição/Regras |
|---|---|---|
| `id` | `cuid` | Chave primária gerenciada pelo CAP. |
| `fotoItem` | `LargeBinary` | Armazena binários da imagem do item. |
| `fotoItemMimeType` | `String(50)` | MIME type da foto. Será aceita apenas imagens do tipo `image/jpeg` ou `image/png`. |
| `fotoItemNome` | `String(255)` | Nome original do arquivo da foto. |
| `sku` | `String(21)` | Código único gerado automaticamente. |
| `nome` | `String(120)` | Nome do item. |
| `descricao` | `String(500)` | Descrição do item. |
| `categoria` | `Association to Categorias` | Categoria do item. |
| `qtdeEstoque` | `Integer default 0` | Quantidade física total em estoque. |
| `qtdeReservada` | `Integer default 0` | Quantidade reservada em pedidos não finalizados/cancelados. |
| `qtdeDisponivel` | `virtual Integer` | `qtdeEstoque - qtdeReservada`. |
| `statusEstoque` | `Association to StatusItensEstoque` | Status calculado com base na quantidade disponível. |
| `currency` | `Currency default 'BRL'` | Moeda para formatação visual. |
| `precoUnitario` | `Decimal(15,2)` | Preço atual do item. |
| `peso` | `Decimal(15,3)` | Peso do item. |
| `altura` | `Decimal(15,3)` | Altura do item. |
| `largura` | `Decimal(15,3)` | Largura do item. |
| `profundidade` | `Decimal(15,3)` | Profundidade do item. |
| `itemAtivo` | `Boolean default true` | Somente item ativo pode ser usado em novos pedidos. |

```cds
entity Itens : cuid, managed {
  fotoItem             : LargeBinary;
  fotoItemMimeType     : String(50);
  fotoItemNome         : String(255);

  sku                  : String(21);
  nome                 : String(120);
  descricao            : String(500);
  categoria            : Association to Categorias;

  qtdeEstoque          : Integer default 0;
  qtdeReservada        : Integer default 0;
  qtdeDisponivel       : virtual Integer;
  statusEstoque        : Association to StatusItensEstoque;

  currency             : Currency default 'BRL';
  precoUnitario        : Decimal(15,2);

  peso                 : Decimal(15,3);
  altura               : Decimal(15,3);
  largura              : Decimal(15,3);
  profundidade         : Decimal(15,3);

  itemAtivo            : Boolean default true;
}
```

### 6.4 Entidade `Pedidos`

| Campo | Tipo sugerido | Descrição/Regras |
|---|---|---|
| `id` | `cuid` | Chave primária gerenciada pelo CAP. |
| `cliente` | `Association to Clientes` | Cliente selecionado para o pedido. |
| `endereco` | `Association to Enderecos` | Endereço principal selecionado/validado. |
| `enderecoPrincipalCompleto` | `String(500)` | Endereço completo usado no pedido. |
| `itensPedido` | `Composition of many ItensPedido` | Itens selecionados no pedido. |
| `pagamento` | `Composition of one Pagamentos` | Última tentativa segura de pagamento. |
| `clienteSnapshot` | `Composition of one PedidosClienteSnapshots` | Snapshot do cliente/endereço. |
| `itensSnapshot` | `Composition of many PedidosItensSnapshots` | Snapshots dos itens. |
| `statusPedido` | `Association to StatusPedidos` | Status do ciclo de vida do pedido. |
| `observacao` | `String(500)` | Observações do pedido. |
| `currency` | `Currency default 'BRL'` | Moeda para formatação visual. |
| `valorTotal` | `Decimal(15,2)` | Total persistido do pedido. |
| `dataFinalizacao` | `Timestamp` | Data/hora da finalização. |
| `motivoCancelamento` | `String(500)` | Motivo informado no cancelamento. |
| `dataCancelamento` | `Timestamp` | Data/hora do cancelamento. |
| `canceladoPor` | `User` | Usuário responsável pelo cancelamento. |

```cds
entity Pedidos : cuid, managed {
  cliente                    : Association to Clientes;
  endereco                   : Association to Enderecos;
  enderecoPrincipalCompleto  : String(500);

  itensPedido                : Composition of many ItensPedido on itensPedido.pedido = $self;
  pagamento                  : Composition of one Pagamentos on pagamento.pedido = $self;

  clienteSnapshot            : Composition of one PedidosClienteSnapshots on clienteSnapshot.pedido = $self;
  itensSnapshot              : Composition of many PedidosItensSnapshots on itensSnapshot.pedido = $self;

  statusPedido               : Association to StatusPedidos;
  observacao                 : String(500);

  currency                   : Currency default 'BRL';
  valorTotal                 : Decimal(15,2);

  dataFinalizacao            : Timestamp;
  motivoCancelamento         : String(500);
  dataCancelamento           : Timestamp;
  canceladoPor               : User;
}
```

### 6.5 Entidade `ItensPedido`

| Campo | Tipo sugerido | Descrição/Regras |
|---|---|---|
| `id` | `cuid` | Chave primária gerenciada pelo CAP. |
| `pedido` | `Association to Pedidos` | Pedido proprietário. |
| `item` | `Association to Itens` | Item original selecionado. |
| `qtdeItemPedido` | `Integer` | Quantidade solicitada. Deve ser maior que zero. |
| `precoUnitarioSnapshot` | `Decimal(15,2)` | Preço fixado no momento da inclusão/confirmação. |
| `currency` | `Currency default 'BRL'` | Moeda para formatação visual. |
| `valorTotal` | `virtual Decimal(15,2)` | `qtdeItemPedido * precoUnitarioSnapshot`. |
| `observacao` | `String(500)` | Observações do item no pedido. |

```cds
entity ItensPedido : cuid, managed {
  pedido                  : Association to Pedidos;
  item                    : Association to Itens;
  qtdeItemPedido           : Integer;
  precoUnitarioSnapshot    : Decimal(15,2);
  currency                 : Currency default 'BRL';
  valorTotal               : virtual Decimal(15,2);
  observacao               : String(500);
}
```

### 6.6 Entidade `Pagamentos`

A entidade `Pagamentos` representa **apenas a última tentativa segura de pagamento** do pedido. Dados sensíveis informados na tela devem ser usados apenas em memória durante a action `simularPagamentoPedido` e descartados em seguida.

| Campo | Tipo sugerido | Descrição/Regras |
|---|---|---|
| `id` | `cuid` | Chave primária gerenciada pelo CAP. |
| `pedido` | `Association to Pedidos` | Pedido associado. |
| `metodoPagamento` | `Association to MetodosPagamento` | Cartão de crédito ou débito. |
| `statusPagamento` | `Association to StatusPagamentos` | Pendente, aprovado ou recusado. |
| `bandeiraCartao` | `String(30)` | Bandeira simulada/detectada. |
| `ultimos4DigitosCartao` | `String(4)` | Apenas os quatro últimos dígitos. |
| `cartaoMascarado` | `String(30)` | Representação segura do cartão. |
| `codigoAutorizacao` | `String(50)` | Código fictício/seguro da autorização. |
| `mensagemPagamento` | `String(255)` | Mensagem segura do resultado. |
| `dataPagamento` | `Timestamp` | Data/hora da última tentativa. |

```cds
entity Pagamentos : cuid, managed {
  pedido                  : Association to Pedidos;

  metodoPagamento         : Association to MetodosPagamento;
  statusPagamento         : Association to StatusPagamentos;

  bandeiraCartao          : String(30);
  ultimos4DigitosCartao   : String(4);
  cartaoMascarado         : String(30);

  codigoAutorizacao       : String(50);
  mensagemPagamento       : String(255);
  dataPagamento           : Timestamp;
}
```

### 6.7 Entidade `PedidosClienteSnapshots`

| Campo | Tipo sugerido | Descrição |
|---|---|---|
| `id` | `UUID` | Chave primária. |
| `pedido` | `Association to Pedidos` | Pedido associado. |
| `fotoCliente` | `LargeBinary` | Snapshot da foto, se aplicável. |
| `fotoClienteMimeType` | `String(50)` | MIME type congelado. |
| `fotoClienteNome` | `String(255)` | Nome do arquivo congelado. |
| `cpf` | `String(11)` | CPF congelado. |
| `nome` | `String(255)` | Nome congelado. |
| `email` | `String(100)` | E-mail congelado. |
| `telefone` | `String(11)` | Telefone congelado. |
| `generoCode` | `String(30)` | Código do gênero congelado. |
| `generoNome` | `String(100)` | Texto do gênero congelado. |
| `dataNascimento` | `Date` | Data congelada. |
| `clienteAtivo` | `Boolean` | Status do cliente no encerramento. |
| `scoreCliente` | `Decimal(5,2)` | Score congelado. |
| `endereco` | `String(500)` | Endereço completo usado no pedido. |
| `telefoneFormatado` | `virtual String(15)` | Telefone formatado para exibição. |
| `cpfFormatado` | `virtual String(14)` | CPF formatado para exibição. |

Todos os campos persistidos desta entidade devem ser somente leitura após criação.

### 6.8 Entidade `PedidosItensSnapshots`

| Campo | Tipo sugerido | Descrição |
|---|---|---|
| `id` | `UUID` | Chave primária. |
| `pedido` | `Association to Pedidos` | Pedido associado. |
| `sku` | `String(21)` | SKU congelado. |
| `nome` | `String(120)` | Nome congelado. |
| `descricao` | `String(500)` | Descrição congelada. |
| `categoriaCode` | `String(30)` | Código da categoria congelada. |
| `categoriaNome` | `String(100)` | Nome da categoria congelada. |
| `qtdeItemPedido` | `Integer` | Quantidade comprada. |
| `precoUnitarioSnapshot` | `Decimal(15,2)` | Preço congelado. |
| `currency` | `Currency default 'BRL'` | Moeda para formatação visual. |
| `valorTotal` | `Decimal(15,2)` | Valor total congelado. |
| `peso` | `Decimal(15,3)` | Peso congelado. |
| `altura` | `Decimal(15,3)` | Altura congelada. |
| `largura` | `Decimal(15,3)` | Largura congelada. |
| `profundidade` | `Decimal(15,3)` | Profundidade congelada. |

Todos os campos persistidos desta entidade devem ser somente leitura após criação.

### 6.9 Entidades auxiliares / CodeLists

```cds
entity Generos : CodeList {
  key code : String(30);
}

entity Categorias : CodeList {
  key code : String(30);
}

entity StatusItensEstoque : CodeList {
  key code : String(30) enum {
    SEM_ESTOQUE = 'SEM_ESTOQUE';
    ACABANDO    = 'ACABANDO';
    EM_ESTOQUE  = 'EM_ESTOQUE';
  };
  criticality : Integer;
}

entity StatusPedidos : CodeList {
  key code : String(40) enum {
    CRIADO                = 'CRIADO';
    AGUARDANDO_PAGAMENTO  = 'AGUARDANDO_PAGAMENTO';
    AGUARDANDO_APROVACAO  = 'AGUARDANDO_APROVACAO';
    FINALIZADO            = 'FINALIZADO';
    CANCELADO             = 'CANCELADO';
  };
  criticality : Integer;
}

entity MetodosPagamento : CodeList {
  key code : String(20) enum {
    CARTAO_CREDITO = 'CARTAO_CREDITO';
    CARTAO_DEBITO  = 'CARTAO_DEBITO';
  };
}

entity StatusPagamentos : CodeList {
  key code : String(30) enum {
    PENDENTE = 'PENDENTE';
    APROVADO = 'APROVADO';
    RECUSADO = 'RECUSADO';
  };
  criticality : Integer;
}
```

---

## 7. Regras de Negócio

### 7.1 Clientes

- O cadastro ou edição de clientes será feito utilizando draft.
- CPF é obrigatório, único, deve ser salvo apenas com números e exibido com máscara por meio do campo virtual `cpfFormatado`.
- Cliente pode possuir mais de um endereço.
- Apenas um endereço por cliente pode ser marcado como principal.
- Cliente inativo não pode ser usado em novos pedidos.
- Cliente não pode ser excluído se possuir qualquer pedido vinculado, independentemente do status.
- A inativação de cliente deve ocorrer por edição direta do campo clienteAtivo, permitida apenas para usuários administradores. Não haverá action específica para ativar ou inativar cliente.
- Fotos devem aceitar apenas JPEG ou PNG.
- Ao salvar foto, devem ser persistidos também `fotoClienteMimeType` e `fotoClienteNome`.

### 7.2 Endereços

- O cadastro ou edição de endereços será feito utilizando draft.
- ViaCEP será utilizado para preenchimento automático e validação obrigatória.
- Se a API ViaCEP estiver indisponível, o cadastro/alteração de endereço deve ser bloqueado.
- Mensagem para API indisponível: `Não foi possível validar o CEP no momento. Tente novamente em alguns instantes.`
- Mensagem para CEP inválido/não encontrado: `CEP inválido ou não encontrado. Verifique o número informado.`
- Campos retornados pelo ViaCEP não podem ser editados manualmente.
- Número do endereço é obrigatório.
- Não será permitido endereço sem número.
- Ao marcar um endereço como principal, os demais endereços do mesmo cliente devem ser desmarcados.

### 7.3 Itens e estoque

- O cadastro ou edição de itens será feito utilizando draft.
- SKU é obrigatório, único e gerado automaticamente no backend antes da persistência definitiva.
- `qtdeDisponivel` deve ser calculada como `qtdeEstoque - qtdeReservada`.
- Item inativo não pode ser usado em novos pedidos.
- A ativação ou inativação de item deve ocorrer por edição direta do campo itemAtivo, permitida apenas para usuários administradores. Ao alterar itemAtivo para false, o backend deve validar se o item possui estoque disponível ou pedido ativo vinculado. Não haverá action específica para ativar ou inativar item.
- Item sem estoque pode aparecer em consultas, exceto quando filtros de disponibilidade/ativos impedirem sua exibição.
- Status de estoque deve ser recalculado automaticamente pelo backend após criação, edição, confirmação de pedido, reserva, liberação, cancelamento ou baixa de estoque. Essa rotina deve ser função interna, não exposta como action OData e não acionada por botão na UI.
- Fotos devem aceitar apenas JPEG ou PNG.
- Ao salvar foto, devem ser persistidos também `fotoItemMimeType` e `fotoItemNome`.

### 7.4 SKU

O SKU será gerado automaticamente no backend e deverá respeitar as seguintes regras:

- ser único;
- ter tamanho máximo compatível com `String(21)`;
- usar letras maiúsculas;
- remover acentos;
- remover caracteres especiais;
- usar partes da categoria, nome e descrição;
- adicionar sufixo sequencial para reduzir colisões;
- executar retry em caso de colisão.

Formato recomendado:

```text
CCC-NNN-DDD-0001
```

Exemplo:

```text
Categoria = Celular
Nome = Samsung
Descrição = Modelo A36 256Gb
SKU = CEL-SAM-MOD-0001
```

### 7.5 Pedidos

- O status inicial do pedido será `CRIADO`.
- `CRIADO` representa pedido em elaboração, ainda sem reserva de estoque.
- O cadastro ou edição de pedidos será feito utilizando draft.
- Pedido deve ser vinculado a um cliente existente e ativo.
- Pedido deve possuir endereço principal válido pertencente ao cliente.
- Ao criar/salvar draft, nenhuma reserva de estoque deve ser feita.
- A reserva de estoque deve ocorrer apenas na action `confirmarPedido`.
- Ao confirmar pedido, o sistema deve validar cliente, endereço, itens e disponibilidade, calcular total, reservar estoque e alterar status para `AGUARDANDO_PAGAMENTO`.
- Pedido só pode ser excluído enquanto estiver em draft ou `CRIADO`, sem pagamento, sem reserva e sem snapshot.
- Após qualquer movimentação de estoque ou pagamento, o pedido deve ser cancelado, não excluído.
- Pedido `FINALIZADO` não pode ser editado, excluído, cancelado ou reaberto.
- Pedido `CANCELADO` não pode ser editado, excluído diretamente ou reaberto.

### 7.6 Edição de pedido com reserva já realizada

Ao editar itens de pedido com reserva já realizada, o sistema deve calcular o delta entre a reserva anterior e a nova composição do pedido:

- se a quantidade aumentou, validar disponibilidade adicional e incrementar reserva;
- se a quantidade reduziu, liberar a diferença da reserva;
- se o item foi removido, liberar a reserva total daquele item;
- se o item foi adicionado, validar disponibilidade e reservar;
- todas as alterações devem ocorrer em transação.

> Recomendação: para simplificar o escopo inicial, considerar bloquear edição de itens após `AGUARDANDO_PAGAMENTO`, permitindo apenas cancelamento e recriação do pedido. Caso a edição seja permitida, as regras de delta acima são obrigatórias.

### 7.7 Pagamento

- Pedido pode passar por pagamento simulado com cartão de crédito ou débito.
- Outros meios de pagamento, como Pix e boleto, estão fora do escopo.
- Pagamento aprovado altera o pedido para `AGUARDANDO_APROVACAO`.
- Pagamento recusado mantém o pedido em `AGUARDANDO_PAGAMENTO`.
- Em caso de pagamento recusado, o usuário pode realizar nova tentativa.
- A aplicação manterá apenas os dados seguros da última tentativa de pagamento.
- A cada nova tentativa, a entidade `Pagamentos` do pedido será sobrescrita com o novo resultado seguro.
- Não será mantido histórico de tentativas de pagamento no escopo inicial.

### 7.8 Cancelamento

- Pedido pode ser cancelado nos status `CRIADO`, `AGUARDANDO_PAGAMENTO` e `AGUARDANDO_APROVACAO`.
- Pedido `FINALIZADO` não pode ser cancelado.
- O motivo de cancelamento deve ser informado na action `cancelarPedido`.
- Ao cancelar pedido com reserva, o sistema deve liberar o estoque reservado.
- Ao cancelar pedido, o sistema deve gerar snapshots caso ainda não existam.
- O sistema deve preencher `motivoCancelamento`, `dataCancelamento` e `canceladoPor`.

---

## 8. Fluxo de Status do Pedido

### 8.1 Definição dos status

| Status | Descrição |
|---|---|
| `CRIADO` | Pedido em elaboração, editável, sem reserva e sem pagamento aprovado. |
| `AGUARDANDO_PAGAMENTO` | Pedido confirmado, com estoque reservado, aguardando pagamento. |
| `AGUARDANDO_APROVACAO` | Pagamento aprovado, estoque ainda reservado, aguardando aprovação/finalização. |
| `FINALIZADO` | Estoque baixado, snapshots gerados e pedido imutável. |
| `CANCELADO` | Reserva liberada, snapshots gerados e pedido imutável. |

### 8.2 Transições permitidas

| Origem | Destino | Permitido? | Condição |
|---|---:|---:|---|
| `CRIADO` | `AGUARDANDO_PAGAMENTO` | Sim | Action `confirmarPedido` executada com sucesso. |
| `AGUARDANDO_PAGAMENTO` | `AGUARDANDO_APROVACAO` | Sim | Pagamento simulado aprovado. |
| `AGUARDANDO_PAGAMENTO` | `AGUARDANDO_PAGAMENTO` | Sim | Pagamento recusado; nova tentativa permitida. |
| `AGUARDANDO_APROVACAO` | `FINALIZADO` | Sim | Action `aprovarPedido` executada com sucesso. |
| `CRIADO` | `CANCELADO` | Sim | Cancelamento permitido. Pode não haver reserva. |
| `AGUARDANDO_PAGAMENTO` | `CANCELADO` | Sim | Libera reserva e gera snapshot. |
| `AGUARDANDO_APROVACAO` | `CANCELADO` | Sim | Libera reserva e gera snapshot. |
| `CANCELADO` | `CRIADO` | Não | Pedido cancelado não pode ser reaberto. |
| `FINALIZADO` | `CANCELADO` | Não | Pedido finalizado é imutável. |
| `FINALIZADO` | `CRIADO` | Não | Pedido finalizado não pode ser reaberto. |

---

## 9. Reserva, Baixa, Liberação e Concorrência de Estoque

### 9.1 Confirmação do pedido

Ao executar `confirmarPedido`, o sistema deve:

1. validar que o pedido está em `CRIADO`;
2. validar cliente ativo;
3. validar endereço pertencente ao cliente e marcado como principal;
4. validar itens ativos;
5. validar `qtdeItemPedido > 0`;
6. validar disponibilidade atual do estoque;
7. fixar `precoUnitarioSnapshot` nos itens do pedido;
8. calcular e persistir `valorTotal` no pedido;
9. incrementar `qtdeReservada` dos itens;
10. recalcular `qtdeDisponivel` e `statusEstoque`;
11. alterar `statusPedido` para `AGUARDANDO_PAGAMENTO`.

### 9.2 Aprovação/finalização

Ao executar `aprovarPedido`, o sistema deve:

1. validar que o pedido está em `AGUARDANDO_APROVACAO`;
2. validar que o pagamento está aprovado;
3. validar que o estoque reservado ainda corresponde aos itens do pedido;
4. reduzir `qtdeEstoque` pela quantidade do pedido;
5. reduzir `qtdeReservada` pela quantidade do pedido;
6. recalcular `qtdeDisponivel` e `statusEstoque`;
7. gerar snapshots do cliente, endereço e itens;
8. preencher `dataFinalizacao`;
9. alterar `statusPedido` para `FINALIZADO`.

### 9.3 Cancelamento

Ao executar `cancelarPedido`, o sistema deve:

1. validar se o status permite cancelamento;
2. exigir motivo de cancelamento;
3. gerar snapshots do cliente, endereço e itens caso ainda não existam;
4. liberar reserva de estoque, se houver;
5. recalcular `qtdeDisponivel` e `statusEstoque`;
6. preencher `motivoCancelamento`, `dataCancelamento` e `canceladoPor`;
7. alterar `statusPedido` para `CANCELADO`.

### 9.4 Regra de status de estoque

| Código | Regra | Descrição |
|---|---|---|
| `SEM_ESTOQUE` | `qtdeDisponivel = 0` | Não há unidades disponíveis para novos pedidos. |
| `ACABANDO` | `qtdeDisponivel >= 1 e <= 10` | Estoque baixo. |
| `EM_ESTOQUE` | `qtdeDisponivel >= 11` | Estoque disponível em quantidade suficiente. |

### 9.5 Controle de concorrência

Todas as operações que alteram `qtdeEstoque`, `qtdeReservada` e `qtdeDisponivel` devem ser executadas em transação no backend.

Regras obrigatórias:

- Antes de reservar, liberar ou baixar estoque, o sistema deve reler o item no banco de dados dentro da mesma transação.
- A disponibilidade deve ser recalculada com base nos valores atuais persistidos.
- A aplicação não deve confiar em valores de estoque recebidos da UI.
- Quando duas operações simultâneas tentarem reservar o mesmo item, apenas a primeira transação que validar disponibilidade suficiente deverá prosseguir.
- A segunda transação deverá receber erro de estoque insuficiente ou concorrência caso a disponibilidade atualizada não seja suficiente.
- As actions `confirmarPedido`, `aprovarPedido` e `cancelarPedido` devem ser idempotentes sempre que possível.
- O sistema deve evitar dupla reserva, dupla baixa ou dupla liberação.

---

## 10. Pagamento Simulado com Cartão

### 10.1 Princípios de segurança

- Coletar dados do cartão apenas na tela, no momento da simulação do pagamento.
- Usar os dados do cartão apenas durante a action `simularPagamentoPedido`.
- Não persistir número completo do cartão.
- Não persistir CVV.
- Não persistir validade completa.
- Não exibir dados sensíveis do cartão no pedido.
- Salvar apenas resultado seguro da transação simulada na entidade `Pagamentos`.
- Exibir apenas cartão mascarado.

Exemplo:

```text
VISA **** **** **** 1234
```

### 10.2 Campos solicitados na tela de pagamento

- Tipo do cartão: crédito ou débito.
- Número do cartão fictício.
- Nome do titular fictício.
- Validade fictícia.
- CVV fictício.

### 10.3 Campos persistidos em `Pagamentos`

| Campo | Tipo sugerido | Descrição |
|---|---|---|
| `metodoPagamento` | `Association to MetodosPagamento` | Cartão de crédito ou débito. |
| `statusPagamento` | `Association to StatusPagamentos` | Pendente, aprovado ou recusado. |
| `bandeiraCartao` | `String(30)` | Bandeira simulada/detectada. |
| `ultimos4DigitosCartao` | `String(4)` | Somente os últimos quatro dígitos. |
| `cartaoMascarado` | `String(30)` | Representação segura do cartão. |
| `codigoAutorizacao` | `String(50)` | Código fictício/seguro da autorização. |
| `mensagemPagamento` | `String(255)` | Mensagem segura do resultado. |
| `dataPagamento` | `Timestamp` | Data/hora da última tentativa. |

### 10.4 Fluxo de pagamento

```text
Usuário preenche dados fictícios do cartão na UI
↓
Frontend envia dados para a action simularPagamentoPedido
↓
Backend valida formato básico e regras simuladas
↓
Se aprovado:
  - pagamento.statusPagamento = APROVADO
  - pedido.statusPedido = AGUARDANDO_APROVACAO
  - salvar apenas dados seguros em Pagamentos
↓
Se recusado:
  - pagamento.statusPagamento = RECUSADO
  - pedido.statusPedido permanece AGUARDANDO_PAGAMENTO
  - salvar mensagem segura da recusa
  - permitir nova tentativa
↓
Dados sensíveis são descartados e não persistidos
```

### 10.5 Regras simuladas recomendadas

- Cartões iniciados com `4` podem ser tratados como VISA.
- Cartões iniciados com `5` podem ser tratados como MASTERCARD.
- CVV igual a `000` pode simular recusa.
- Valores acima de limite definido podem simular recusa por limite.
- As regras devem ser determinísticas o suficiente para testes.

### 10.6 Nova tentativa de pagamento

Quando o pagamento for recusado:

- o pedido permanece em `AGUARDANDO_PAGAMENTO`;
- o usuário pode realizar nova tentativa;
- a entidade `Pagamentos` será atualizada com o novo resultado seguro;
- dados seguros da tentativa anterior serão sobrescritos;
- não haverá histórico de tentativas no escopo inicial.

---

## 11. Cálculos do Pedido

### 11.1 Cálculo de itens

O valor total de cada item do pedido deve ser calculado como:

```text
ItensPedido.valorTotal = qtdeItemPedido * precoUnitarioSnapshot
```

`ItensPedido.valorTotal` deve ser virtual, pois é derivado dos campos do próprio item do pedido.

### 11.2 Cálculo do pedido

O total do pedido deve ser calculado no backend e persistido em `Pedidos.valorTotal`:

```text
Pedidos.valorTotal = soma(ItensPedido.qtdeItemPedido * ItensPedido.precoUnitarioSnapshot)
```

### 11.3 Validações de cálculo

- `qtdeItemPedido > 0`.
- `precoUnitarioSnapshot >= 0`.
- `valorTotal >= 0`.
- `qtdeEstoque >= 0`.
- `qtdeReservada >= 0`.
- `qtdeReservada <= qtdeEstoque`.
- `qtdeDisponivel = qtdeEstoque - qtdeReservada`.
- `qtdeDisponivel >= 0`.
- Todos os cálculos definitivos devem ocorrer no backend.

---

## 12. Snapshots e Histórico

Snapshots serão criados no momento da aprovação/finalização ou cancelamento do pedido. Eles devem congelar todos os dados relevantes do cliente, endereço e itens, garantindo que alterações posteriores nas tabelas originais não alterem o histórico do pedido.

### 12.1 Decisão arquitetural

A aplicação utilizará tabelas auxiliares de snapshot:

- `PedidosClienteSnapshots`;
- `PedidosItensSnapshots`.

Essa abordagem permite:

- preservar histórico;
- reduzir acoplamento com tabelas originais;
- manter pedido finalizado/cancelado imutável;
- facilitar consulta histórica do pedido.

### 12.2 Regras de snapshot

- Snapshot é criado apenas na aprovação/finalização ou cancelamento.
- Snapshot não pode ser editado por usuário comum nem por admin.
- Se o pedido for `FINALIZADO` ou `CANCELADO`, o snapshot deve existir obrigatoriamente.
- Se o snapshot já existir, o sistema deve bloquear sua recriação.
- O histórico deve ser lido a partir das tabelas de snapshot, não das tabelas originais.
- Snapshots representam os dados vigentes no momento do encerramento do pedido, seja por finalização ou cancelamento.

---

## 13. Interface do Usuário — SAP Fiori Elements

O template utilizado será **List Report/Object Page**. A aplicação será única, com navegação interna entre:

- Clientes;
- Estoque;
- Pedidos.

### 13.1 Listas e filtros

| Módulo | Campos na lista | Filtros recomendados |
|---|---|---|
| Clientes | Foto, CPF, Nome, E-mail, Telefone, Ativo, Cidade, UF, Data de Cadastro | Nome, CPF, E-mail, Ativo, Cidade, UF |
| Estoque | SKU, Nome, Categoria, Qtde Estoque, Qtde Reservada, Qtde Disponível, Status, Preço, Ativo | SKU, Nome, Categoria, Status, Ativo, Qtde Disponível |
| Pedidos | ID, CPF, Cliente, Status Pedido, Status Pagamento, Total, Data Pedido, Data Finalização | Cliente, CPF, Status Pedido, Status Pagamento, Data, Valor Total |

### 13.2 SideEffects ao alterar cliente no pedido

Ao alterar o cliente em um pedido ainda editável, a aplicação deve:

- validar se o cliente selecionado está ativo;
- atualizar o endereço do pedido com base no endereço principal do cliente selecionado;
- atualizar `enderecoPrincipalCompleto`;
- não gerar `clienteSnapshot` temporário;
- não limpar os itens do pedido automaticamente;
- recalcular mensagens e validações relacionadas ao pedido.

Caso o cliente selecionado não possua endereço principal válido, o sistema deve bloquear a confirmação do pedido e exibir mensagem de erro.

### 13.3 Ações disponíveis por status do pedido

| Status do pedido | Editar | Confirmar | Efetuar pagamento | Aprovar/finalizar | Cancelar | Excluir |
|---|---:|---:|---:|---:|---:|---:|
| Draft | Sim | Não | Não | Não | Não | Sim |
| `CRIADO` | Sim | Sim | Não | Não | Sim | Sim, se não houver pagamento, reserva ou snapshot |
| `AGUARDANDO_PAGAMENTO` | Não, exceto ajustes permitidos por regra | Não | Sim | Não | Sim | Não |
| `AGUARDANDO_APROVACAO` | Não | Não | Não | Sim | Sim | Não |
| `FINALIZADO` | Não | Não | Não | Não | Não | Não |
| `CANCELADO` | Não | Não | Não | Não | Não | Não |

Regras complementares:

- `confirmarPedido` só deve estar disponível para pedidos em `CRIADO`.
- `simularPagamentoPedido` só deve estar disponível para pedidos em `AGUARDANDO_PAGAMENTO`.
- `aprovarPedido` só deve estar disponível para pedidos em `AGUARDANDO_APROVACAO`.
- `cancelarPedido` deve estar disponível para `CRIADO`, `AGUARDANDO_PAGAMENTO` e `AGUARDANDO_APROVACAO`.

---

## 14. Actions, Funções Internas e Eventos CAP

### 14.1 Actions públicas recomendadas

Actions públicas são operações de negócio expostas ao usuário ou ao frontend.

| Domínio | Action | Descrição |
|---|---|---|
| Clientes/Endereços | `definirEnderecoPrincipal` | Define um endereço como principal e desmarca os demais do cliente. |
| Pedidos | `confirmarPedido` | Valida pedido, calcula total, reserva estoque e altera status para `AGUARDANDO_PAGAMENTO`. |
| Pedidos | `simularPagamentoPedido` | Processa pagamento fictício sem persistir dados sensíveis. |
| Pedidos | `aprovarPedido` | Valida pagamento/estoque, gera snapshots, baixa estoque e finaliza pedido. |
| Pedidos | `cancelarPedido` | Cancela pedido, registra motivo, libera reserva e gera snapshots. |

### 14.2 Assinaturas conceituais de actions

```cds
action confirmarPedido(pedidoId: UUID) returns Pedidos;

action simularPagamentoPedido(
  pedidoId: UUID,
  metodoPagamento: String,
  numeroCartao: String,
  nomeTitular: String,
  validade: String,
  cvv: String
) returns Pagamentos;

action aprovarPedido(pedidoId: UUID) returns Pedidos;

action cancelarPedido(
  pedidoId: UUID,
  motivoCancelamento: String(500)
) returns Pedidos;
```

### 14.3 Funções internas / validações de backend

Funções internas não devem ser expostas diretamente como actions OData. Elas devem ser implementadas em helpers, validations ou handlers.

#### Clientes

- `validarCpf`
- `validarTelefone`
- `validarDataNascimento`
- `validarClienteAtivo`
- `formatarCpf`
- `formatarTelefone`
- `validarFotoCliente`

#### Endereços

- `validarCepViaCEP`
- `montarEnderecoCompleto`
- `validarEnderecoPrincipalUnico`

#### Itens/Estoque

- `validarFotoItem`
- `gerarSku`
- `validarItemAtivo`
- `validarDisponibilidadeEstoque`
- `recalcularStatusEstoque`
- `reservarEstoque`
- `liberarReservaEstoque`
- `baixarEstoqueReservado`
- `validarConcorrenciaEstoque`

#### Pedidos

- `calcularTotalPedido`
- `validarTransicaoStatus`
- `gerarSnapshotPedido`
- `validarPagamentoAprovado`
- `validarPedidoEditavel`
- `validarPedidoCancelavel`

### 14.4 Handlers recomendados

- `before CREATE Clientes`: validar CPF, campos obrigatórios, unicidade e foto.
- `before UPDATE Clientes`: validar campos e impedir alterações indevidas.
- `before DELETE Clientes`: bloquear exclusão se houver qualquer pedido vinculado.
- `after READ Clientes`: preencher `telefoneFormatado`, `cpfFormatado` e `enderecoPrincipalCompleto`.
- `before CREATE Enderecos`: validar CEP via ViaCEP, número obrigatório e endereço principal único.
- `before UPDATE Enderecos`: validar CEP e impedir edição manual dos campos retornados pelo ViaCEP.
- `after READ Enderecos`: preencher `cepFormatado` e `enderecoCompleto`.
- `before PATCH Enderecos`: preencher campos de endereço com base no retorno da API ViaCEP durante criação/edição por draft.
- `before CREATE Itens`: gerar SKU único, validar preço, quantidades e foto.
- `before UPDATE Itens`: validar inativação e recalcular status.
- `before CREATE Pedidos`: validar campos básicos, mas não reservar estoque em draft.
- `before UPDATE Pedidos`: bloquear alterações em `FINALIZADO` e `CANCELADO`.
- `on confirmarPedido`: validar pedido, calcular total, reservar estoque e alterar status.
- `on simularPagamentoPedido`: processar dados em memória e salvar apenas resultado seguro em `Pagamentos`.
- `on aprovarPedido`: validar status, pagamento, estoque, gerar snapshot e finalizar pedido.
- `on cancelarPedido`: validar status, registrar motivo, liberar reserva, gerar snapshot e cancelar pedido.

> Como as operações CRUD usam draft, os eventos próprios de draft devem ser considerados. A reserva definitiva de estoque não deve ocorrer em criação de rascunho.

---

## 15. Mensagens de Erro e Sucesso

| Código | Mensagem |
|---|---|
| `CLIENTE_CPF_INVALIDO` | CPF inválido. Verifique o número informado. |
| `CLIENTE_CPF_DUPLICADO` | Já existe um cliente cadastrado com este CPF. |
| `CLIENTE_INATIVO` | Cliente inativo não pode realizar pedido. |
| `CLIENTE_COM_PEDIDO` | Cliente não pode ser excluído pois possui pedido vinculado. |
| `CLIENTE_SEM_ENDERECO_PRINCIPAL` | Cliente selecionado não possui endereço principal válido. |
| `CEP_INDISPONIVEL` | Não foi possível validar o CEP no momento. Tente novamente em alguns instantes. |
| `CEP_INVALIDO` | CEP inválido ou não encontrado. Verifique o número informado. |
| `ENDERECO_NUMERO_OBRIGATORIO` | Número do endereço é obrigatório. |
| `FOTO_FORMATO_INVALIDO` | Formato de imagem inválido. Utilize JPEG ou PNG. |
| `ITEM_SKU_DUPLICADO` | Já existe item cadastrado com este SKU. |
| `ITEM_ESTOQUE_INSUFICIENTE` | Estoque insuficiente para o item selecionado. |
| `ITEM_ESTOQUE_CONCORRENTE` | O estoque do item foi alterado por outra operação. Atualize o pedido e tente novamente. |
| `ITEM_INATIVO` | Item inativo não pode ser usado em novo pedido. |
| `ITEM_INATIVACAO_BLOQUEADA` | Item não pode ser inativado pois possui estoque disponível ou pedido ativo vinculado. |
| `PEDIDO_STATUS_INVALIDO` | Transição de status não permitida. |
| `PEDIDO_STATUS_PAGAMENTO_PENDENTE` | Pagamento pendente. O pedido não pode ser finalizado. |
| `PEDIDO_FINALIZADO_IMUTAVEL` | Pedido finalizado não pode ser alterado. |
| `PEDIDO_CANCELADO_IMUTAVEL` | Pedido cancelado não pode ser alterado. |
| `PEDIDO_MOTIVO_CANCELAMENTO_OBRIGATORIO` | Informe o motivo do cancelamento. |
| `PAGAMENTO_APROVADO` | Pagamento aprovado com sucesso. |
| `PAGAMENTO_RECUSADO` | Pagamento recusado. O pedido permanecerá aguardando pagamento. |
| `SNAPSHOT_EXISTENTE` | Snapshot do pedido já foi gerado e não pode ser recriado. |

---

## 16. Critérios de Aceite

### 16.1 Clientes

- Dado um usuário admin, quando cadastrar um cliente com CPF válido e único, então o sistema deve salvar o CPF apenas com números e exibir o valor formatado em `cpfFormatado`.
- Dado um usuário comum, quando tentar criar, editar ou excluir cliente, então o sistema deve bloquear a operação por falta de permissão.
- Dado um cliente com pedido vinculado, quando o admin tentar excluí-lo, então o sistema deve bloquear a exclusão.
- Dado um cliente inativo, quando ele for selecionado em um novo pedido, então o sistema deve bloquear a confirmação do pedido.
- Dado um upload de foto de cliente, quando o arquivo não for JPEG ou PNG, então o sistema deve bloquear a persistência.
- Dado um upload válido de foto de cliente, quando o cliente for salvo, então o sistema deve persistir `fotoCliente`, `fotoClienteMimeType` e `fotoClienteNome`.

### 16.2 Endereços

- Dado um CEP válido, quando o usuário informar o CEP no endereço, então o sistema deve preencher automaticamente logradouro, bairro, cidade, UF e estado via ViaCEP.
- Dado que a API ViaCEP esteja indisponível, quando o usuário tentar cadastrar ou alterar um endereço, então o sistema deve bloquear a operação.
- Dado um cliente com um endereço principal já definido, quando outro endereço for marcado como principal, então o sistema deve desmarcar os demais endereços do cliente.
- Dado um endereço sem número, quando o usuário tentar salvar, então o sistema deve bloquear a operação.

### 16.3 Itens e estoque

- Dado um usuário admin, quando cadastrar um item válido, então o sistema deve gerar SKU único automaticamente.
- Dado um item com `qtdeEstoque = 10` e `qtdeReservada = 3`, quando o sistema recalcular o estoque, então `qtdeDisponivel` deve ser `7`.
- Dado um item com `qtdeDisponivel = 0`, quando o status de estoque for recalculado, então `statusEstoque` deve ser `SEM_ESTOQUE`.
- Dado um item com `qtdeDisponivel` entre `1` e `10`, quando o status de estoque for recalculado, então `statusEstoque` deve ser `ACABANDO`.
- Dado um item com `qtdeDisponivel >= 11`, quando o status de estoque for recalculado, então `statusEstoque` deve ser `EM_ESTOQUE`.
- Dado um item inativo, quando ele for selecionado em um novo pedido, então o sistema deve bloquear a confirmação do pedido.
- Dado duas confirmações simultâneas para o mesmo item com estoque limitado, quando a primeira consumir a disponibilidade, então a segunda deve ser bloqueada caso não haja estoque suficiente.

### 16.4 Pedidos

- Dado um pedido em draft, quando ele for salvo como rascunho, então nenhuma reserva de estoque deve ser realizada.
- Dado um pedido em `CRIADO` com cliente ativo, endereço principal e itens válidos, quando o usuário executar `confirmarPedido`, então o sistema deve reservar estoque e alterar o status para `AGUARDANDO_PAGAMENTO`.
- Dado um pedido em `AGUARDANDO_PAGAMENTO`, quando o pagamento simulado for aprovado, então `statusPagamento` deve ser `APROVADO` e `statusPedido` deve ser `AGUARDANDO_APROVACAO`.
- Dado um pedido em `AGUARDANDO_PAGAMENTO`, quando o pagamento simulado for recusado, então `statusPagamento` deve ser `RECUSADO` e `statusPedido` deve permanecer `AGUARDANDO_PAGAMENTO`.
- Dado um pagamento recusado, quando o usuário realizar nova tentativa, então o sistema deve substituir os dados seguros da tentativa anterior pelos dados da última tentativa.
- Dado um pedido em `AGUARDANDO_APROVACAO`, quando o usuário executar `aprovarPedido`, então o sistema deve baixar o estoque reservado, gerar snapshots e alterar o status para `FINALIZADO`.
- Dado um pedido em `AGUARDANDO_PAGAMENTO` ou `AGUARDANDO_APROVACAO`, quando o usuário executar `cancelarPedido` informando motivo, então o sistema deve liberar a reserva, gerar snapshots e alterar o status para `CANCELADO`.
- Dado um pedido `FINALIZADO` ou `CANCELADO`, quando qualquer usuário tentar editá-lo, excluí-lo ou reabri-lo, então o sistema deve bloquear a operação.

### 16.5 Pagamento

- Dado um pagamento simulado, quando o usuário informar número completo do cartão, CVV e validade, então esses dados devem ser usados apenas em memória durante a action.
- Dado qualquer resultado de pagamento, então o sistema deve persistir apenas método, status, bandeira, últimos quatro dígitos, cartão mascarado, código de autorização, mensagem segura e data da tentativa.
- Dado um pagamento recusado, quando uma nova tentativa for feita, então a entidade `Pagamentos` deve refletir apenas a última tentativa.

### 16.6 Snapshots

- Dado um pedido finalizado, quando os dados originais do cliente forem alterados posteriormente, então a consulta histórica do pedido deve continuar exibindo os dados congelados no snapshot.
- Dado um pedido cancelado, quando os dados originais dos itens forem alterados posteriormente, então a consulta histórica do pedido deve continuar exibindo os dados congelados no snapshot.
- Dado um pedido que já possui snapshot, quando o sistema tentar gerar snapshot novamente, então a operação deve ser bloqueada.

---

## 17. Estrutura Recomendada do Projeto

```text
sap-cap-pedidos-compras/
├── _i18n/                         # Arquivos de internacionalização dos textos do projeto
├── app/
│   ├── pedidos_compras/
│   │   ├── webapp/
│   │   │   ├── ext/
│   │   │   ├── i18n/
│   │   │   ├── test/
│   │   │   ├── Component.js
│   │   │   ├── index.html
│   │   │   └── manifest.json
│   │   ├── annotations.cds        # Annotations de UI da aplicação
│   │   ├── package.json
│   │   └── ui5.yaml
│   ├── services.cds               # Exporta annotations definidas
│   └── launchpage.html            # Launchpage para simular catálogo Fiori
├── db/
│   ├── data/                      # Dados iniciais/de referência
│   ├── common.cds                 # Tipos, enums, aspects e CodeLists
│   └── schema.cds                 # Entidades persistentes principais
├── srv/
│   ├── utils/
│   │   ├── validations/
│   │   │   ├── clientes.validations.js
│   │   │   ├── enderecos.validations.js
│   │   │   ├── itens.validations.js
│   │   │   ├── pedidos.validations.js
│   │   │   ├── pagamentos.validations.js
│   │   │   └── validations.js
│   │   ├── helpers/
│   │   │   ├── clientes.helpers.js
│   │   │   ├── enderecos.helpers.js
│   │   │   ├── itens.helpers.js
│   │   │   ├── pedidos.helpers.js
│   │   │   ├── pagamentos.helpers.js
│   │   │   └── helpers.js
│   │   └── constants.js
│   ├── handlers/
│   │   ├── clientes.handlers.js
│   │   ├── enderecos.handlers.js
│   │   ├── itens.handlers.js
│   │   ├── pedidos.handlers.js
│   │   └── pagamentos.handlers.js
│   ├── external/
│   │   ├── viacep.client.js
│   │   └── API_VIACEP.csn
│   ├── services.cds
│   ├── services.js
│   └── integration-services.js
├── package.json
├── package-lock.json
├── .cdsrc.json
├── mta.yaml
├── xs-security.json
├── .gitignore
└── README.md
```

---

## 18. Considerações de Segurança

- Controle de acesso por roles no CAP e no XSUAA.
- Validações críticas sempre no backend.
- Dados sensíveis de cartão nunca persistidos.
- CVV nunca salvo ou exibido.
- Número completo do cartão nunca salvo ou exibido.
- Validade completa do cartão nunca salva.
- Dados de pagamento persistidos devem ser apenas dados seguros.
- Pedido finalizado e snapshots são imutáveis.
- Exclusão física deve ser controlada para preservar integridade histórica.
- Preferir inativação a exclusão em entidades de negócio.
- Operações críticas de estoque devem ser transacionais.
- A aplicação não deve confiar em cálculos enviados pela UI.
- Uploads de imagem devem validar MIME type e extensão permitida.

---

## 19. Backlog Futuro

Mesmo fora do escopo inicial, recomenda-se considerar futuramente:

- testes unitários para validações;
- testes de integração para reserva, baixa e liberação de estoque;
- auditoria de alterações críticas;
- histórico completo de tentativas de pagamento;
- logs técnicos estruturados;
- monitoramento produtivo;
- upload externo de imagens;
- integração real com gateway de pagamento;
- integração com serviço de frete;
- regras configuráveis de estoque mínimo por item;
- tratamento avançado de concorrência com versionamento otimista.

---

## 20. Conclusão

Esta especificação técnica revisada consolida as decisões do projeto de pedidos de compras e incorpora melhorias importantes de consistência, rastreabilidade e segurança.

As principais evoluções em relação à versão anterior são:

- padronização dos nomes das entidades;
- adição de metadados para fotos mantendo `LargeBinary`;
- criação da entidade separada `Pagamentos`;
- inclusão de motivo, data e usuário de cancelamento;
- definição de controle de concorrência para estoque;
- ciclo de vida do pedido mais claro;
- separação entre actions públicas e funções internas;
- criação da action `confirmarPedido`;
- definição do comportamento de nova tentativa de pagamento;
- regras claras de SideEffects ao alterar cliente;
- tabela de ações por status;
- critérios de aceite mais objetivos em formato Dado/Quando/Então.

A aplicação resultante permanece adequada para um projeto educacional com SAP CAP, SAP Fiori Elements e SAP BTP, mantendo um desenho mais consistente para implementação, testes manuais e evolução futura.
