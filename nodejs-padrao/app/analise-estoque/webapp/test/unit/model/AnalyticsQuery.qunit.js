/*global QUnit*/
sap.ui.define([
    "analiseestoque/model/AnalyticsQuery",
    "analiseestoque/model/Scenarios"
], function (AnalyticsQuery, Scenarios) {
    "use strict";

    var fnText = function (sKey) { return "T:" + sKey; };
    var oDomain = Scenarios.getDomain("estoque");

    function keys(oObject) {
        return Object.keys(oObject);
    }

    QUnit.module("AnalyticsQuery - consultas");

    QUnit.test("cenário com duas medidas agrega as duas", function (assert) {
        var oQuery = AnalyticsQuery.buildScenarioQuery(Scenarios.getScenario("EstDisponivelPorCategoria"), {});
        assert.strictEqual(oQuery.entitySet, "ItensAnalise");
        assert.deepEqual(keys(oQuery.aggregation.aggregate), ["qtdeReservada", "qtdeDisponivel"]);
        assert.deepEqual(keys(oQuery.aggregation.group), ["categoria", "categoriaTexto"]);
    });

    QUnit.test("valor em estoque não agrupa por currency (medida sem moeda própria)", function (assert) {
        var oQuery = AnalyticsQuery.buildScenarioQuery(Scenarios.getScenario("EstValorPorCategoria"), {});
        assert.deepEqual(keys(oQuery.aggregation.group), ["categoria", "categoriaTexto"]);
        assert.deepEqual(keys(oQuery.aggregation.aggregate), ["valorEstoque"]);
    });

    QUnit.test("KPIs: todas as medidas do domínio, sem dimensão", function (assert) {
        var oQuery = AnalyticsQuery.buildKpiQuery(oDomain, {});
        assert.deepEqual(oQuery.aggregation.group, {});
        assert.deepEqual(keys(oQuery.aggregation.aggregate), ["qtdeItens", "qtdeEstoque", "qtdeReservada", "qtdeDisponivel", "valorEstoque"]);
    });

    QUnit.module("AnalyticsQuery - filtros");

    QUnit.test("list e search combinados", function (assert) {
        var aFilters = AnalyticsQuery.buildFilters({ categoria: ["ELETRONICOS"], sku: " SKU-ELE " }, oDomain.filters);
        assert.deepEqual(aFilters, [
            { path: "categoria", operator: "EQ", values: ["ELETRONICOS"] },
            { path: "sku", operator: "Contains", values: ["SKU-ELE"] }
        ]);
    });

    QUnit.module("AnalyticsQuery - linhas");

    QUnit.test("shapeRows limita ao top do cenário", function (assert) {
        var aRaw = [];
        for (var i = 1; i <= 15; i++) {
            aRaw.push({ nome: "Item " + i, qtdeReservada: i });
        }
        var aRows = AnalyticsQuery.shapeRows(Scenarios.getScenario("EstMaisReservados"), aRaw, fnText);
        assert.strictEqual(aRows.length, 10);
        assert.strictEqual(aRows[0].label, "Item 15");
        assert.strictEqual(aRows[9].label, "Item 6");
    });

    QUnit.test("shapeRows ordena o estoque por Disponível, não pela 1ª medida", function (assert) {
        var aRows = AnalyticsQuery.shapeRows(Scenarios.getScenario("EstDisponivelPorCategoria"), [
            { categoria: "A", categoriaTexto: "A", qtdeReservada: 100, qtdeDisponivel: 1 },
            { categoria: "B", categoriaTexto: "B", qtdeReservada: 1, qtdeDisponivel: 50 }
        ], fnText);
        assert.deepEqual(aRows.map(function (o) { return o.key; }), ["B", "A"]);
    });

    QUnit.test("shapeKpis soma as medidas", function (assert) {
        var oKpis = AnalyticsQuery.shapeKpis(oDomain, [
            { qtdeItens: 2, qtdeEstoque: 30, qtdeReservada: 5, qtdeDisponivel: 25, valorEstoque: "300.5" }
        ]);
        assert.deepEqual(oKpis.values, { qtdeItens: 2, qtdeEstoque: 30, qtdeReservada: 5, qtdeDisponivel: 25, valorEstoque: 300.5 });
    });
});
