/*
 * Validações declarativas de entrada (equivalente às validations simples dos
 * BOs RAP). São avaliadas pelo CAP nos PATCHs do rascunho (mensagens de
 * rascunho no Fiori) e ao salvar. Regras que dependem de algoritmo ou de
 * outros registros (dígitos do CPF, unicidade, ViaCEP, estoque) ficam nos
 * handlers em srv/*.js.
 */
using {pedidoscompras as db} from '../db/schema';

annotate db.Clientes with {
  cpf            @mandatory;
  nome           @mandatory;
  email          @mandatory  @assert.format: {
    $value : '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$',
    message: 'EMAIL_INVALIDO'
  };
  telefone       @mandatory  @assert: (case
                                         when length(telefone) < 10 or length(telefone) > 11 then 'TELEFONE_INVALIDO'
                                       end);
  dataNascimento @mandatory  @assert: (case
                                         when dataNascimento > $now then 'DATA_NASCIMENTO_FUTURA'
                                       end);
  genero         @assert.target;
};

annotate db.Enderecos with {
  cep    @mandatory;
  numero @mandatory.message: 'ENDERECO_NUMERO_OBRIGATORIO'  @mandatory;
};

annotate db.Itens with {
  nome          @mandatory;
  categoria     @mandatory  @assert.target;
  currency      @mandatory  @assert.target;
  precoUnitario @mandatory  @assert: (case
                                        when precoUnitario < 0 then 'ITEM_PRECO_INVALIDO'
                                      end);
  qtdeEstoque   @mandatory  @assert: (case
                                        when qtdeEstoque < 0 or qtdeEstoque < qtdeReservada then 'ITEM_QTDE_ESTOQUE_INVALIDA'
                                      end);
};

annotate db.Pedidos with {
  cliente @mandatory;
};

annotate db.ItensPedido with {
  item           @mandatory;
  qtdeItemPedido @mandatory  @assert: (case
                                         when qtdeItemPedido <= 0 then 'ITEM_QTDE_INVALIDA'
                                       end);
};
