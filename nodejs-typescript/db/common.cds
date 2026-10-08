/*
 * Tipos reutilizáveis e CodeLists do domínio Pedidos de Compras.
 * Equivalente CAP da tabela ZTA_PC_CODELIST + views ZC_PC_*_VH do projeto RAP:
 * cada lista vira uma entidade própria baseada em sap.common.CodeList.
 */
namespace pedidoscompras;

using { sap.common.CodeList } from '@sap/cds/common';

/** CPF somente com dígitos (exibido formatado por elemento calculado). */
type Cpf        : String(11);
/** CEP somente com dígitos. */
type Cep        : String(8);
/** Telefone com DDD, somente dígitos (10 ou 11). */
type Telefone   : String(11);
/** Valores monetários (sempre acompanhados de um elemento Currency). */
type Valor      : Decimal(15, 2);
/** Criticidade Fiori: 0 neutro, 1 negativo, 2 crítico, 3 positivo. */
type Criticidade : Integer enum {
  Neutra   = 0;
  Negativa = 1;
  Critica  = 2;
  Positiva = 3;
}

/** Ordem de exibição e criticidade comuns às CodeLists. */
aspect CodeListOrdenada : CodeList {
  ordem       : Integer;
  criticality : Criticidade default 0;
}

entity Generos : CodeListOrdenada {
  key code : String(30);
}

entity Categorias : CodeListOrdenada {
  key code : String(30);
}

entity StatusEstoque : CodeListOrdenada {
  key code : String(30) enum {
        SEM_ESTOQUE;
        ACABANDO;
        EM_ESTOQUE;
      };
}

entity StatusPedido : CodeListOrdenada {
  key code : String(40) enum {
        ABERTO;
        AGUARDANDO_APROVACAO;
        PROCESSANDO_REEMBOLSO;
        CANCELADO;
        FINALIZADO;
      };
}

entity StatusPagamento : CodeListOrdenada {
  key code : String(30) enum {
        PENDENTE;
        APROVADO;
        RECUSADO;
        DEVOLVIDO;
      };
}

entity StatusReembolso : CodeListOrdenada {
  key code : String(20) enum {
        PENDENTE;
        APROVADO;
        REJEITADO;
      };
}

entity MetodosPagamento : CodeListOrdenada {
  key code : String(20) enum {
        CARTAO_CREDITO;
        CARTAO_DEBITO;
      };
}

/** Situação da consulta de CEP gravada no endereço (V/I/X), como no RAP. */
type StatusCep : String(1) enum {
  Validado     = 'V';
  Invalido     = 'I';
  Indisponivel = 'X';
}

/**
 * Sequenciais do projeto (substitui o Number Range Object ZPC_NR do RAP).
 * PEDIDO -> NumeroPedido; SKU -> sequencial do SKU.
 */
entity Numeracoes {
  key objeto        : String(20);
      ultimoNumero  : Integer64 default 0;
}
