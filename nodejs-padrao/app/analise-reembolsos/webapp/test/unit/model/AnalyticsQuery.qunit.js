/*global QUnit*/
sap.ui.define([
    "analisereembolsos/model/AnalyticsQuery",
    "analisereembolsos/model/Scenarios"
], function (AnalyticsQuery, Scenarios) {
    "use strict";

    var fnText = function (sKey) { return "T:" + sKey; };
    var oDomain = Scenarios.getDomain("reembolsos");

    function keys(oObject) {
        return Object.keys(oObject);
    }

    QUnit.module("AnalyticsQuery - consultas");

    QUnit.test("cenário com medida monetária agrupa por dimensão, texto e currency", function (assert) {
        var oQuery = AnalyticsQuery.buildScenarioQuery(Scenarios.getScenario("ReeValorPorStatus"), {});
        assert.strictEqual(oQuery.entitySet, "ReembolsosAnalise");
        assert.deepEqual(keys(oQuery.aggregation.group), ["statusReembolso", "statusReembolsoTexto", "currency"]);
        assert.deepEqual(keys(oQuery.aggregation.aggregate), ["valorReembolso"]);
    });

    QUnit.test("cenário de quantidade não agrupa por currency", function (assert) {
        var oQuery = AnalyticsQuery.buildScenarioQuery(Scenarios.getScenario("ReePorMotivo"), {});
        assert.deepEqual(keys(oQuery.aggregation.group), ["motivoSolicitacao"]);
        assert.deepEqual(keys(oQuery.aggregation.aggregate), ["qtdeReembolsos"]);
    });

    QUnit.test("KPIs: por moeda (valor dos reembolsos)", function (assert) {
        var oQuery = AnalyticsQuery.buildKpiQuery(oDomain, {});
        assert.deepEqual(keys(oQuery.aggregation.group), ["currency"]);
        assert.deepEqual(keys(oQuery.aggregation.aggregate), ["qtdeReembolsos", "valorReembolso"]);
    });

    QUnit.module("AnalyticsQuery - filtros");

    QUnit.test("list vira OR dentro do campo; outro domínio é ignorado", function (assert) {
        var aFilters = AnalyticsQuery.buildFilters({ statusReembolso: ["PENDENTE", "APROVADO"], genero: ["FEMININO"] }, oDomain.filters);
        assert.deepEqual(aFilters, [{ path: "statusReembolso", operator: "EQ", values: ["PENDENTE", "APROVADO"] }]);
    });

    QUnit.module("AnalyticsQuery - linhas");

    QUnit.test("shapeRows ordena meses da solicitação cronologicamente", function (assert) {
        var aRows = AnalyticsQuery.shapeRows(Scenarios.getScenario("ReeValorPorMes"), [
            { mesSolicitacao: "202609", valorReembolso: 10, currency: "BRL" },
            { mesSolicitacao: "202512", valorReembolso: 20, currency: "BRL" }
        ], fnText);
        assert.deepEqual(aRows.map(function (o) { return o.label; }), ["12/2025", "09/2026"]);
    });

    QUnit.test("shapeRows sem texto usa o próprio valor da dimensão", function (assert) {
        var aRows = AnalyticsQuery.shapeRows(Scenarios.getScenario("ReePorMotivo"), [
            { motivoSolicitacao: "Atraso na entrega", qtdeReembolsos: 1 },
            { motivoSolicitacao: "Produto com defeito", qtdeReembolsos: 3 }
        ], fnText);
        assert.deepEqual(aRows.map(function (o) { return o.label; }), ["Produto com defeito", "Atraso na entrega"]);
    });

    QUnit.test("shapeKpis usa a primeira moeda", function (assert) {
        var oKpis = AnalyticsQuery.shapeKpis(oDomain, [
            { qtdeReembolsos: 3, valorReembolso: "120.5", currency: "BRL" }
        ]);
        assert.deepEqual(oKpis.values, { qtdeReembolsos: 3, valorReembolso: 120.5 });
        assert.strictEqual(oKpis.currency, "BRL");
    });
});
