/*
 * Modelo de domínio do sistema de Pedidos de Compras.
 *
 * Entidades:
 *   Clientes, Enderecos          cadastro de clientes e seus endereços
 *   Itens                        itens de estoque (saldo, reserva e preço)
 *   Pedidos, ItensPedido         pedido de compra e suas linhas
 *   Pagamentos                   última tentativa de pagamento do pedido
 *   PedidosClienteSnapshots,     cópia do cliente/endereço e dos itens
 *   PedidosItensSnapshots        gravada quando o pedido é encerrado
 *   Reembolsos                   solicitação de reembolso de pedido pago
 *
 * Decisões de modelagem:
 *  - Chaves cuid (UUID) e campos administrativos do aspect managed.
 *  - Tabelas de rascunho geradas pelo CAP (@odata.draft.enabled nos serviços).
 *  - qtdeDisponivel e statusEstoque_code são elementos calculados "stored"
 *    (colunas geradas no banco): sempre consistentes com o saldo e filtráveis.
 *  - Os indicadores de status do pedido e os textos formatados (CPF, telefone,
 *    CEP, endereço) são elementos calculados na leitura, sem colunas persistidas.
 */
namespace pedidoscompras;

// Observação: a função portável substring(texto, início, tamanho) do CAP usa
// início base 0 (semântica OData), traduzida para cada banco pelo runtime.

using {
  cuid,
  managed,
  Currency,
  User
} from '@sap/cds/common';
using {
  pedidoscompras.Cpf,
  pedidoscompras.Cep,
  pedidoscompras.Telefone,
  pedidoscompras.Valor,
  pedidoscompras.StatusCep,
  pedidoscompras.Generos,
  pedidoscompras.Categorias,
  pedidoscompras.StatusEstoque,
  pedidoscompras.StatusPedido,
  pedidoscompras.StatusPagamento,
  pedidoscompras.StatusReembolso,
  pedidoscompras.MetodosPagamento
} from './common';

// ---------------------------------------------------------------------------
// Clientes e endereços
// ---------------------------------------------------------------------------

entity Clientes : cuid, managed {
      @Core.MediaType                  : fotoClienteMimeType
      @Core.ContentDisposition.Filename: fotoClienteNome
      @Core.ContentDisposition.Type    : 'inline'
      @Core.AcceptableMediaTypes       : [
        'image/jpeg',
        'image/png',
        'image/webp'
      ]
      fotoCliente          : LargeBinary;

      @Core.IsMediaType
      fotoClienteMimeType  : String(50);
      fotoClienteNome      : String(255);
      cpf                  : Cpf;
      nome                 : String(255);
      email                : String(100);
      telefone             : Telefone;
      genero               : Association to Generos;
      dataNascimento       : Date;
      clienteAtivo         : Boolean default true;
      /** Score de 0 a 100, sorteado na criação (somente leitura). */
      scoreCliente         : Decimal(5, 2);
      enderecos            : Composition of many Enderecos
                               on enderecos.cliente = $self;
      enderecoPrincipal    : Association to one Enderecos
                               on  enderecoPrincipal.cliente   = $self
                               and enderecoPrincipal.principal = true;
      pedidos              : Association to many Pedidos
                               on pedidos.cliente = $self;

      // Calculados na leitura (não são colunas da tabela)
      cpfFormatado         : String(14) = substring(cpf, 0, 3) || '.' || substring(cpf, 3, 3) || '.'
                                          || substring(cpf, 6, 3) || '-' || substring(cpf, 9, 2);
      telefoneFormatado    : String(15) = case
                                            when length(telefone) = 11
                                                 then '(' || substring(telefone, 0, 2) || ') '
                                                      || substring(telefone, 2, 5) || '-' || substring(telefone, 7, 4)
                                            else '(' || substring(telefone, 0, 2) || ') '
                                                 || substring(telefone, 2, 4) || '-' || substring(telefone, 6, 4)
                                          end;
      /** Cor da barra do score: 1 vermelho (até 40), 2 amarelo (até 70), 3 verde. */
      scoreCriticality     : Integer = case
                                         when scoreCliente <= 40 then 1
                                         when scoreCliente <  70 then 2
                                         else 3
                                       end;
}

entity Enderecos : cuid, managed {
  cliente          : Association to Clientes;
  cep              : Cep;
  logradouro       : String(150);
  numero           : String(20);
  complemento      : String(100);
  bairro           : String(100);
  cidade           : String(100);
  uf               : String(2);
  estado           : String(100);
  /** CEP geral de município: o ViaCEP não devolve logradouro/bairro. */
  cepGeral         : Boolean default false;
  /** Resultado da consulta ao ViaCEP (V validado, I inválido, X indisponível). */
  cepStatus        : StatusCep;
  /** Apenas um endereço principal por cliente. */
  principal        : Boolean default false;

  cepFormatado     : String(9)   = substring(cep, 0, 5) || '-' || substring(cep, 5, 3);
  enderecoCompleto : String(500) = logradouro || ', ' || numero
                                   || case
                                        when complemento is null or complemento = '' then ''
                                        else ' - ' || complemento
                                      end
                                   || ' - ' || bairro || ' - ' || cidade || '/' || uf
                                   || ' - CEP ' || substring(cep, 0, 5) || '-' || substring(cep, 5, 3);
  /** Logradouro/Bairro: editáveis (7 = obrigatório) só para CEP geral, senão somente leitura (1). */
  controleCampoCep : Integer = case
                                 when cepGeral = true then 7
                                 else 1
                               end;
}

// ---------------------------------------------------------------------------
// Estoque
// ---------------------------------------------------------------------------

entity Itens : cuid, managed {
  @Core.MediaType                  : fotoItemMimeType
  @Core.ContentDisposition.Filename: fotoItemNome
  @Core.ContentDisposition.Type    : 'inline'
  @Core.AcceptableMediaTypes       : [
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
  fotoItem           : LargeBinary;

  @Core.IsMediaType
  fotoItemMimeType   : String(50);
  fotoItemNome       : String(255);
  /** SKU-<3 letras da categoria>-<10 dígitos>, gerado no Save. */
  sku                : String(21);
  nome               : String(120);
  descricao          : String(500);
  categoria          : Association to Categorias;
  qtdeEstoque        : Integer default 0;
  /** Alterada somente pela reserva/liberação/baixa do pedido. */
  qtdeReservada      : Integer default 0;
  qtdeDisponivel     : Integer     = qtdeEstoque - qtdeReservada stored;
  statusEstoque_code : String(30)  = case
                                       when qtdeEstoque - qtdeReservada <= 0  then 'SEM_ESTOQUE'
                                       when qtdeEstoque - qtdeReservada <= 10 then 'ACABANDO'
                                       else 'EM_ESTOQUE'
                                     end stored;
  statusEstoque      : Association to StatusEstoque
                         on statusEstoque.code = statusEstoque_code;
  currency           : Currency default 'BRL';
  precoUnitario      : Valor;
  itemAtivo          : Boolean default true;
}

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

entity Pedidos : cuid, managed {
  /** Número sequencial gerado no registro do pedido (primeiro Save). */
  numeroPedido              : String(10);
  cliente                   : Association to Clientes;
  /** Endereço principal do cliente, derivado automaticamente. */
  endereco                  : Association to Enderecos;
  enderecoPrincipalCompleto : String(500);
  itens                     : Composition of many ItensPedido
                                on itens.pedido = $self;
  /** Somente a última tentativa segura de pagamento. */
  pagamento                 : Composition of one Pagamentos
                                on pagamento.pedido = $self;
  clienteSnapshot           : Composition of one PedidosClienteSnapshots
                                on clienteSnapshot.pedido = $self;
  itensSnapshot             : Composition of many PedidosItensSnapshots
                                on itensSnapshot.pedido = $self;
  reembolsos                : Association to many Reembolsos
                                on reembolsos.pedido = $self;
  statusPedido              : Association to StatusPedido;
  /** Réplica do status do pagamento, para lista e filtros. */
  statusPagamento           : Association to StatusPagamento;
  observacao                : String(500);
  /**
   * Referência do pedido na planilha importada (coluna Pedido). Gravada só
   * pela importação; impede reimportar o mesmo pedido para o mesmo cliente.
   */
  referenciaImportacao      : String(40);
  currency                  : Currency default 'BRL';
  valorTotal                : Valor default 0;
  dataFinalizacao           : Timestamp;
  motivoCancelamento        : String(500);
  dataCancelamento          : Timestamp;
  canceladoPor              : User;

  // Indicadores calculados na leitura: dirigem a Object Page dinâmica
  // (seções e campos visíveis conforme o status do pedido).
  /** FINALIZADO ou CANCELADO: cliente e itens vêm dos snapshots. */
  encerrado                 : Boolean = case
                                          when statusPedido.code = 'FINALIZADO'
                                            or statusPedido.code = 'CANCELADO' then true
                                          else false
                                        end;
  naoEncerrado              : Boolean = case
                                          when statusPedido.code = 'FINALIZADO'
                                            or statusPedido.code = 'CANCELADO' then false
                                          else true
                                        end;
  naoFinalizado             : Boolean = case
                                          when statusPedido.code = 'FINALIZADO' then false
                                          else true
                                        end;
  naoCancelado              : Boolean = case
                                          when statusPedido.code = 'CANCELADO' then false
                                          else true
                                        end;
}

entity ItensPedido : cuid, managed {
  pedido                : Association to Pedidos;
  item                  : Association to Itens;
  qtdeItemPedido        : Integer;
  /** Preço provisório no rascunho; fixado no registro do pedido. */
  precoUnitarioSnapshot : Valor;
  currency              : Currency default 'BRL';
  valorTotal            : Valor default 0;
  observacao            : String(500);
}

/**
 * Última tentativa segura de pagamento. Número completo do cartão, validade
 * e CVV NUNCA são persistidos.
 */
entity Pagamentos : cuid, managed {
  pedido                : Association to Pedidos;
  metodoPagamento       : Association to MetodosPagamento;
  statusPagamento       : Association to StatusPagamento;
  bandeiraCartao        : String(30);
  ultimos4DigitosCartao : String(4);
  cartaoMascarado       : String(30);
  codigoAutorizacao     : String(50);
  mensagemPagamento     : String(255);
  dataPagamento         : Timestamp;
}

/** Dados do cliente e do endereço congelados no encerramento do pedido. */
entity PedidosClienteSnapshots : cuid, managed {
  pedido            : Association to Pedidos;
  cliente           : Association to Clientes;
  cpf               : Cpf;
  nome              : String(255);
  email             : String(100);
  telefone          : Telefone;
  genero            : Association to Generos;
  dataNascimento    : Date;
  clienteAtivo      : Boolean;
  scoreCliente      : Decimal(5, 2);
  endereco          : Association to Enderecos;
  cep               : Cep;
  logradouro        : String(150);
  numero            : String(20);
  complemento       : String(100);
  bairro            : String(100);
  cidade            : String(100);
  uf                : String(2);
  estado            : String(100);
  enderecoCompleto  : String(500);
  /** FINALIZACAO ou CANCELAMENTO. */
  motivoSnapshot    : String(40);

  cpfFormatado      : String(14) = substring(cpf, 0, 3) || '.' || substring(cpf, 3, 3) || '.'
                                   || substring(cpf, 6, 3) || '-' || substring(cpf, 9, 2);
  telefoneFormatado : String(15) = case
                                     when length(telefone) = 11
                                          then '(' || substring(telefone, 0, 2) || ') '
                                               || substring(telefone, 2, 5) || '-' || substring(telefone, 7, 4)
                                     else '(' || substring(telefone, 0, 2) || ') '
                                          || substring(telefone, 2, 4) || '-' || substring(telefone, 6, 4)
                                   end;
}

/** Itens congelados no encerramento do pedido. */
entity PedidosItensSnapshots : cuid, managed {
  pedido        : Association to Pedidos;
  itemPedido    : Association to ItensPedido;
  item          : Association to Itens;
  sku           : String(21);
  nome          : String(120);
  descricao     : String(500);
  categoria     : Association to Categorias;
  quantidade    : Integer;
  currency      : Currency;
  precoUnitario : Valor;
  valorTotal    : Valor;
}

// ---------------------------------------------------------------------------
// Reembolsos
// ---------------------------------------------------------------------------

/**
 * Solicitação de reembolso criada quando um pedido com pagamento aprovado é
 * cancelado; decidida na aplicação Gestão de Reembolsos.
 */
entity Reembolsos : cuid, managed {
  pedido               : Association to Pedidos;
  numeroPedido         : String(10);
  cliente              : Association to Clientes;
  statusReembolso      : Association to StatusReembolso;
  /** Status do pedido antes da solicitação; restaurado se rejeitado. */
  statusPedidoAnterior : Association to StatusPedido;
  currency             : Currency;
  valorReembolso       : Valor;
  motivoSolicitacao    : String(500);
  dataSolicitacao      : Timestamp;
  solicitadoPor        : User;
  motivoDecisao        : String(500);
  dataDecisao          : Timestamp;
  decididoPor          : User;
}

// ---------------------------------------------------------------------------
// Restrições de unicidade (geram UNIQUE constraints nas tabelas ativas)
// ---------------------------------------------------------------------------

annotate Clientes with @assert.unique.cpf: [cpf];
annotate Itens with @assert.unique.sku: [sku];
annotate Pedidos with @assert.unique.numeroPedido: [numeroPedido];
annotate Enderecos with @assert.unique.cepPorCliente: [
  cliente,
  cep
];
