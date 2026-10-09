/*global QUnit*/
sap.ui.define([
    "analiseclientes/model/AnalyticsQuery",
    "analiseclientes/model/Scenarios"
], function (AnalyticsQuery, Scenarios) {
    "use strict";

    var fnText = function (sKey) { return "T:" + sKey; };
    var oDomain = Scenarios.getDomain("clientes");

    function keys(oObject) {
        return Object.keys(oObject);
    }

    QUnit.module("AnalyticsQuery - consultas");

    QUnit.test("cenário de quantidade agrupa por dimensão e texto, sem currency", function (assert) {
        var oQuery = AnalyticsQuery.buildScenarioQuery(Scenarios.getScenario("CliPorGenero"), {});
        assert.strictEqual(oQuery.entitySet, "ClientesAnalise");
        assert.deepEqual(keys(oQuery.aggregation.group), ["genero", "generoTexto"]);
        assert.deepEqual(keys(oQuery.aggregation.aggregate), ["qtdeClientes"]);
    });

    QUnit.test("KPIs: sem medida monetária não agrupa por moeda", function (assert) {
        var oQuery = AnalyticsQuery.buildKpiQuery(oDomain, {});
        assert.deepEqual(oQuery.aggregation.group, {});
        assert.deepEqual(keys(oQuery.aggregation.aggregate), ["qtdeClientes", "scoreMedio"]);
    });

    QUnit.test("valores de filtro: grupo do campo com o texto", function (assert) {
        var oQuery = AnalyticsQuery.buildFilterValuesQuery(oDomain, oDomain.filters[0]);
        assert.deepEqual(keys(oQuery.aggregation.group), ["genero", "generoTexto"]);
    });

    QUnit.module("AnalyticsQuery - filtros");

    QUnit.test("boolean e search", function (assert) {
        var aFilters = AnalyticsQuery.buildFilters({ clienteAtivo: "false", nome: "  ana " }, oDomain.filters);
        assert.deepEqual(aFilters, [
            { path: "clienteAtivo", operator: "EQ", values: [false] },
            { path: "nome", operator: "Contains", values: ["ana"] }
        ]);
        assert.deepEqual(AnalyticsQuery.buildFilters({ clienteAtivo: "", nome: "   " }, oDomain.filters), []);
    });

    QUnit.test("filtros de outro domínio são ignorados", function (assert) {
        assert.deepEqual(AnalyticsQuery.buildFilters({ statusPedido: ["ABERTO"] }, oDomain.filters), []);
    });

    QUnit.module("AnalyticsQuery - linhas");

    QUnit.test("texto da dimensão: faixa de score e mês de cadastro", function (assert) {
        assert.strictEqual(AnalyticsQuery.dimensionText("faixaScore", { faixaScore: "ALTO" }, fnText), "T:faixaALTO");
        assert.strictEqual(AnalyticsQuery.dimensionText("mesCadastro", { mesCadastro: "202610" }, fnText), "10/2026");
        assert.strictEqual(AnalyticsQuery.dimensionText("genero", { genero: "FEMININO", generoTexto: "Feminino" }, fnText), "Feminino");
    });

    QUnit.test("shapeRows tira a média das médias na mesma chave", function (assert) {
        var aRows = AnalyticsQuery.shapeRows(Scenarios.getScenario("CliScorePorUf"), [
            { uf: "SP", scoreMedio: "40" },
            { uf: "SP", scoreMedio: "60" },
            { uf: "RJ", scoreMedio: 70 }
        ], fnText);
        assert.deepEqual(aRows.map(function (o) { return o.key; }), ["RJ", "SP"]);
        assert.strictEqual(aRows[1].values.scoreMedio, 50);
    });

    QUnit.test("shapeKpis sem dados devolve zeros", function (assert) {
        var oEmpty = AnalyticsQuery.shapeKpis(oDomain, []);
        assert.deepEqual(oEmpty.values, { qtdeClientes: 0, scoreMedio: 0 });
    });
});
