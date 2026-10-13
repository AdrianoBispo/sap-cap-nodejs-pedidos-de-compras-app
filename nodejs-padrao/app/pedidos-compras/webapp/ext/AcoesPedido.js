/**
 * Visibilidade das ações do pedido (grupo "Ações") na tabela do List Report:
 * só aparecem com ao menos uma linha selecionada cujo pedido não esteja
 * encerrado (FINALIZADO ou CANCELADO). Sem itens visíveis, o grupo some.
 */
sap.ui.define([], function () {
    "use strict";

    /** Status em que o pedido não aceita mais ações. */
    const ENCERRADOS = ["FINALIZADO", "CANCELADO"];

    return {
        /**
         * Visibilidade das ações no List Report.
         * @param {sap.ui.model.odata.v4.Context} _contextoPagina contexto da página (não usado)
         * @param {sap.ui.model.odata.v4.Context[]} contextosSelecionados linhas selecionadas
         * @returns {boolean} true se alguma linha selecionada não está encerrada
         */
        visivel: function (_contextoPagina, contextosSelecionados) {
            return (contextosSelecionados || []).some(function (contexto) {
                const status = contexto.getProperty("statusPedido_code");
                return !!status && ENCERRADOS.indexOf(status) === -1;
            });
        }
    };
});
