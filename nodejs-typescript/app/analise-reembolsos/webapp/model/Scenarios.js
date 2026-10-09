/*
 * Catálogo de "Análise de Pedidos de Reembolsos": o domínio reembolsos (entity set do serviço
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
        valorReembolso: { kind: "money", currency: true, labelKey: "measureValorReembolso" },
        qtdeReembolsos: { kind: "int", labelKey: "measureQtdeReembolsos" }
    };

    // Dimensões: text = campo com a descrição; kind = month (AAAAMM) | faixa (BAIXO/MEDIO/ALTO).
    var DIMENSIONS = {
        statusReembolso: { text: "statusReembolsoTexto", labelKey: "dimStatusReembolso" },
        motivoSolicitacao: { labelKey: "dimMotivo" },
        mesSolicitacao: { kind: "month", labelKey: "dimMesSolicitacao" },
        uf: { labelKey: "dimUf" }
    };

    // Campos de filtro do domínio (UI.SelectionFields do serviço).
    // type: list = valores distintos lidos do serviço; boolean = Todos/Sim/Não; search = contém.
    var DOMAINS = [
        {
            key: "reembolsos",
            entitySet: "ReembolsosAnalise",
            icon: "sap-icon://money-bills",
            manage: { intent: "Reembolso-manage", app: "gestaoreembolsos" },
            filters: [
                { field: "statusReembolso", type: "list" },
                { field: "uf", type: "list" },
                { field: "mesSolicitacao", type: "list" }
            ],
            kpis: ["qtdeReembolsos", "valorReembolso"]
        }
    ];

    // Cenários. sort: by = "measure" (1ª medida) ou "dimension"; desc; top limita as linhas.
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
        sc("ReeValorPorStatus", "reembolsos", "statusReembolso", ["valorReembolso"], "column", BY_MEASURE),
        sc("ReeQtdePorStatus", "reembolsos", "statusReembolso", ["qtdeReembolsos"], "donut", BY_MEASURE),
        sc("ReeValorPorMes", "reembolsos", "mesSolicitacao", ["valorReembolso"], "column", BY_DIMENSION),
        sc("ReeValorPorUf", "reembolsos", "uf", ["valorReembolso"], "column", BY_MEASURE),
        sc("ReePorMotivo", "reembolsos", "motivoSolicitacao", ["qtdeReembolsos"], "column", BY_MEASURE)
    ];

    return {
        measures: MEASURES,
        dimensions: DIMENSIONS,
        domains: DOMAINS,
        scenarios: SCENARIOS,

        getDomain: function (sKey) {
            return DOMAINS.find(function (oDomain) { return oDomain.key === sKey; });
        },
        getScenario: function (sId) {
            return SCENARIOS.find(function (oScenario) { return oScenario.id === sId; });
        },
        getScenariosOf: function (sDomain) {
            return SCENARIOS.filter(function (oScenario) { return oScenario.domain === sDomain; });
        }
    };
});
