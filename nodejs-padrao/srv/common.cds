namespace pedidoscompras;

/** Resultado das actions de importação por planilha. */
type ResultadoImportacao {
  registrosCriados : Integer;
  mensagem         : String(255);
}

/**
 * Permissões do usuário logado. Cada serviço expõe um singleton com este
 * formato para a UI esconder o que o usuário não pode alterar: os papéis
 * (@restrict) não chegam às anotações de UI, que são iguais para todos.
 */
aspect Permissoes {
  /** true quando o usuário só pode consultar (não é Admin). */
  somenteLeitura : Boolean;
}
