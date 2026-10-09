/*
 * Catálogo de "Análise de Clientes": o domínio clientes (entity set do serviço
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
        qtdeClientes: { kind: "int", labelKey: "measureQtdeClientes" },
        scoreMedio: { kind: "dec", avg: true, labelKey: "measureScoreMedio" }
    };

    // Dimensões: text = campo com a descrição; kind = month (AAAAMM) | faixa (BAIXO/MEDIO/ALTO).
    var DIMENSIONS = {
        genero: { text: "generoTexto", labelKey: "dimGenero" },
        faixaScore: { kind: "faixa", labelKey: "dimFaixaScore" },
        mesCadastro: { kind: "month", labelKey: "dimMesCadastro" },
        nome: { labelKey: "dimNome" },
        uf: { labelKey: "dimUf" },
        clienteAtivo: { kind: "boolean", labelKey: "dimClienteAtivo" }
    };

    // Campos de filtro do domínio (UI.SelectionFields do serviço).
    // type: list = valores distintos lidos do serviço; boolean = Todos/Sim/Não; search = contém.
    var DOMAINS = [
        {
            key: "clientes",
            entitySet: "ClientesAnalise",
            icon: "sap-icon://customer",
            manage: { intent: "Cliente-manage", app: "gestaoclientes" },
            filters: [
                { field: "genero", type: "list" },
                { field: "clienteAtivo", type: "boolean" },
                { field: "uf", type: "list" },
                { field: "faixaScore", type: "list" },
                { field: "nome", type: "search" }
            ],
            kpis: ["qtdeClientes", "scoreMedio"]
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
        sc("CliPorGenero", "clientes", "genero", ["qtdeClientes"], "donut", BY_MEASURE),
        sc("CliPorUf", "clientes", "uf", ["qtdeClientes"], "column", BY_MEASURE),
        sc("CliPorFaixaScore", "clientes", "faixaScore", ["qtdeClientes"], "donut", BY_MEASURE),
        sc("CliCadastrosPorMes", "clientes", "mesCadastro", ["qtdeClientes"], "column", BY_DIMENSION),
        sc("CliScorePorUf", "clientes", "uf", ["scoreMedio"], "column", BY_MEASURE)
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
