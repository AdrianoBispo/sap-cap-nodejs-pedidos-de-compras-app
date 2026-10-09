/**
 * Visibilidade das ações do pedido (grupo "Ações") na tabela do List Report:
 * só aparecem com ao menos uma linha selecionada cujo pedido não esteja
 * encerrado (FINALIZADO ou CANCELADO). Sem itens visíveis, o grupo some.
 */
sap.ui.define([], function () {
    "use strict";

    const ENCERRADOS = ["FINALIZADO", "CANCELADO"];

    return {
        visivel: function (_contextoPagina, contextosSelecionados) {
            return (contextosSelecionados || []).some(function (contexto) {
                const status = contexto.getProperty("statusPedido_code");
                return !!status && ENCERRADOS.indexOf(status) === -1;
            });
        }
    };
});
