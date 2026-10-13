/*
 * Catálogo de "Análise de Pedidos de Compras": o domínio pedidos (entity set do serviço
 * AnaliticoService) e os seus 5 cenários de gráfico.
 *
 * Os campos vêm do $metadata de AnaliticoService (CAP). As medidas usam a agregação padrão do
 * backend (@Aggregation.default; no OData são "custom aggregates"), por isso o $apply é
 * aggregate(Medida) sem método explícito.
 */
sap.ui.define([], function () {
    "use strict";

    // Medidas: kind define a formatação; avg indica média (não soma) ao juntar linhas duplicadas;
    // currency indica que a medida depende de Currency (Currency entra no groupby).
    var MEASURES = {
        valorTotal: { kind: "money", currency: true, labelKey: "measureValorTotal" },
        valorMedio: { kind: "money", currency: true, avg: true, labelKey: "measureValorMedio" },
        qtdePedidos: { kind: "int", labelKey: "measureQtdePedidos" }
    };

    // Dimensões: text = campo com a descrição; kind = month (AAAAMM) | faixa (BAIXO/MEDIO/ALTO).
    var DIMENSIONS = {
        statusPedido: { text: "statusPedidoTexto", labelKey: "dimStatusPedido" },
        statusPagamento: { text: "statusPagamentoTexto", labelKey: "dimStatusPagamento" },
        mesCriacao: { kind: "month", labelKey: "dimMesCriacao" },
        uf: { labelKey: "dimUf" }
    };

    // Campos de filtro do domínio (UI.SelectionFields do serviço).
    // type: list = valores distintos lidos do serviço; boolean = Todos/Sim/Não; search = contém.
    var DOMAINS = [
        {
            key: "pedidos",
            entitySet: "PedidosAnalise",
            icon: "sap-icon://sales-order",
            manage: { intent: "PedidoCompra-manage", app: "pedidoscompras" },
            filters: [
                { field: "statusPedido", type: "list" },
                { field: "statusPagamento", type: "list" },
                { field: "uf", type: "list" },
                { field: "mesCriacao", type: "list" }
            ],
            kpis: ["valorTotal", "qtdePedidos", "valorMedio"]
        }
    ];

    /**
     * Cria um cenário.
     * @param {string} id identificador (também prefixo das chaves de i18n)
     * @param {string} domain chave do domínio
     * @param {string} dimension dimensão do eixo/legenda
     * @param {string[]} measures medidas
     * @param {string} chart column | bar | line | donut
     * @param {{by: string, desc: boolean, measure?: string}} sort by = "measure" (1ª medida) ou "dimension"
     * @param {number} [top] limita as linhas (0 = todas)
     * @returns {object}
     */
    function sc(id, domain, dimension, measures, chart, sort, top) {
        return {
            id: id,
            domain: domain,
            dimension: dimension,
            measures: measures,
            chart: chart,
            sort: sort,
            top: top || 0
        };
    }
    var BY_MEASURE = { by: "measure", desc: true };
    var BY_DIMENSION = { by: "dimension", desc: false };

    var SCENARIOS = [
        sc("PedValorPorStatus", "pedidos", "statusPedido", ["valorTotal"], "column", BY_MEASURE),
        sc("PedPorMes", "pedidos", "mesCriacao", ["qtdePedidos"], "column", BY_DIMENSION),
        sc("PedValorPorUf", "pedidos", "uf", ["valorTotal"], "column", BY_MEASURE),
        sc("PedPorPagamento", "pedidos", "statusPagamento", ["qtdePedidos"], "donut", BY_MEASURE),
        sc("PedTicketMedio", "pedidos", "statusPedido", ["valorMedio"], "column", BY_MEASURE)
    ];

    return {
        measures: MEASURES,
        dimensions: DIMENSIONS,
        domains: DOMAINS,
        scenarios: SCENARIOS,

        /**
         * @param {string} sKey chave do domínio
         * @returns {object|undefined} o domínio
         */
        getDomain: function (sKey) {
            return DOMAINS.find(function (oDomain) { return oDomain.key === sKey; });
        },
        /**
         * @param {string} sId identificador do cenário
         * @returns {object|undefined} o cenário
         */
        getScenario: function (sId) {
            return SCENARIOS.find(function (oScenario) { return oScenario.id === sId; });
        },
        /**
         * @param {string} sDomain chave do domínio
         * @returns {object[]} cenários do domínio, na ordem do catálogo
         */
        getScenariosOf: function (sDomain) {
            return SCENARIOS.filter(function (oScenario) { return oScenario.domain === sDomain; });
        }
    };
});
