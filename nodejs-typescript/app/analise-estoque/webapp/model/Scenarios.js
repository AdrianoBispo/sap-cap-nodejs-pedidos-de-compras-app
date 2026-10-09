/*
 * Catálogo de "Análise de Itens do Estoque": o domínio estoque (entity set do serviço
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
        qtdeEstoque: { kind: "int", labelKey: "measureQtdeEstoque" },
        qtdeReservada: { kind: "int", labelKey: "measureQtdeReservada" },
        qtdeDisponivel: { kind: "int", labelKey: "measureQtdeDisponivel" },
        valorEstoque: { kind: "money", labelKey: "measureValorEstoque" },
        qtdeItens: { kind: "int", labelKey: "measureQtdeItens" }
    };

    // Dimensões: text = campo com a descrição; kind = month (AAAAMM) | faixa (BAIXO/MEDIO/ALTO).
    var DIMENSIONS = {
        categoria: { text: "categoriaTexto", labelKey: "dimCategoria" },
        statusEstoque: { text: "statusEstoqueTexto", labelKey: "dimStatusEstoque" },
        nome: { labelKey: "dimNome" },
        sku: { labelKey: "dimSku" }
    };

    // Campos de filtro do domínio (UI.SelectionFields do serviço).
    // type: list = valores distintos lidos do serviço; boolean = Todos/Sim/Não; search = contém.
    var DOMAINS = [
        {
            key: "estoque",
            entitySet: "ItensAnalise",
            icon: "sap-icon://product",
            manage: { intent: "ItemEstoque-manage", app: "gestaoestoque" },
            filters: [
                { field: "categoria", type: "list" },
                { field: "statusEstoque", type: "list" },
                { field: "nome", type: "search" },
                { field: "sku", type: "search" }
            ],
            kpis: ["qtdeItens", "qtdeEstoque", "qtdeReservada", "qtdeDisponivel", "valorEstoque"]
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

    var SCENARIOS = [
        sc("EstDisponivelPorCategoria", "estoque", "categoria", ["qtdeReservada", "qtdeDisponivel"], "column", { by: "measure", desc: true, measure: "qtdeDisponivel" }),
        sc("EstItensPorSituacao", "estoque", "statusEstoque", ["qtdeItens"], "donut", BY_MEASURE),
        sc("EstValorPorCategoria", "estoque", "categoria", ["valorEstoque"], "column", BY_MEASURE),
        sc("EstMaisReservados", "estoque", "nome", ["qtdeReservada"], "column", BY_MEASURE, 10),
        sc("EstItensPorCategoria", "estoque", "categoria", ["qtdeItens"], "donut", BY_MEASURE)
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
