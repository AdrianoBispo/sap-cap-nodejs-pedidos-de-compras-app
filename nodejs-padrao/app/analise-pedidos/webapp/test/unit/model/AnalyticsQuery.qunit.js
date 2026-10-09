/*global QUnit*/
sap.ui.define([
    "analisepedidos/model/AnalyticsQuery",
    "analisepedidos/model/Scenarios"
], function (AnalyticsQuery, Scenarios) {
    "use strict";

    var fnText = function (sKey) { return "T:" + sKey; };
    var oDomain = Scenarios.getDomain("pedidos");

    function keys(oObject) {
        return Object.keys(oObject);
    }

    QUnit.module("AnalyticsQuery - consultas");

    QUnit.test("cenário com medida monetária agrupa por dimensão, texto e currency", function (assert) {
        var oQuery = AnalyticsQuery.buildScenarioQuery(Scenarios.getScenario("PedValorPorStatus"), {});
        assert.strictEqual(oQuery.entitySet, "PedidosAnalise");
        assert.deepEqual(keys(oQuery.aggregation.group), ["statusPedido", "statusPedidoTexto", "currency"]);
        assert.deepEqual(keys(oQuery.aggregation.aggregate), ["valorTotal"]);
        assert.deepEqual(oQuery.filters, []);
    });

    QUnit.test("cenário de quantidade não agrupa por currency", function (assert) {
        var oQuery = AnalyticsQuery.buildScenarioQuery(Scenarios.getScenario("PedPorMes"), {});
        assert.deepEqual(keys(oQuery.aggregation.group), ["mesCriacao"]);
        assert.deepEqual(keys(oQuery.aggregation.aggregate), ["qtdePedidos"]);
    });

    QUnit.test("KPIs: aggregate sem dimensão, por moeda quando há valor monetário", function (assert) {
        var oQuery = AnalyticsQuery.buildKpiQuery(oDomain, {});
        assert.deepEqual(keys(oQuery.aggregation.group), ["currency"]);
        assert.deepEqual(keys(oQuery.aggregation.aggregate), ["valorTotal", "qtdePedidos", "valorMedio"]);
    });

    QUnit.test("valores de filtro: grupo do campo com o texto", function (assert) {
        var oQuery = AnalyticsQuery.buildFilterValuesQuery(oDomain, oDomain.filters[0]);
        assert.deepEqual(keys(oQuery.aggregation.group), ["statusPedido", "statusPedidoTexto"]);
    });

    QUnit.module("AnalyticsQuery - filtros");

    QUnit.test("list vira OR dentro do campo; vazio não filtra", function (assert) {
        var aFilters = AnalyticsQuery.buildFilters({ statusPedido: ["ABERTO", "CANCELADO"], uf: [] }, oDomain.filters);
        assert.deepEqual(aFilters, [{ path: "statusPedido", operator: "EQ", values: ["ABERTO", "CANCELADO"] }]);
        assert.deepEqual(AnalyticsQuery.buildFilters(undefined, oDomain.filters), []);
    });

    QUnit.test("filtros de outro domínio são ignorados", function (assert) {
        assert.deepEqual(AnalyticsQuery.buildFilters({ genero: ["FEMININO"] }, oDomain.filters), []);
    });

    QUnit.module("AnalyticsQuery - linhas");

    QUnit.test("texto da dimensão: descrição, mês e vazio", function (assert) {
        assert.strictEqual(AnalyticsQuery.dimensionText("statusPedido", { statusPedido: "ABERTO", statusPedidoTexto: "Aberto" }, fnText), "Aberto");
        assert.strictEqual(AnalyticsQuery.dimensionText("mesCriacao", { mesCriacao: "202610" }, fnText), "10/2026");
        assert.strictEqual(AnalyticsQuery.dimensionText("uf", { uf: "" }, fnText), "-");
        assert.strictEqual(AnalyticsQuery.dimensionText("uf", { uf: "SP" }, fnText), "SP");
    });

    QUnit.test("shapeRows ordena por medida decrescente", function (assert) {
        var aRows = AnalyticsQuery.shapeRows(Scenarios.getScenario("PedValorPorUf"), [
            { uf: "RJ", valorTotal: "10.50", currency: "BRL" },
            { uf: "SP", valorTotal: "99", currency: "BRL" },
            { uf: "MG", valorTotal: 30, currency: "BRL" }
        ], fnText);
        assert.deepEqual(aRows.map(function (o) { return o.key; }), ["SP", "MG", "RJ"]);
        assert.strictEqual(aRows[2].values.valorTotal, 10.5, "decimal vem como string");
        assert.strictEqual(aRows[0].currency, "BRL");
    });

    QUnit.test("shapeRows ordena meses cronologicamente", function (assert) {
        var aRows = AnalyticsQuery.shapeRows(Scenarios.getScenario("PedPorMes"), [
            { mesCriacao: "202611", qtdePedidos: 2 },
            { mesCriacao: "202510", qtdePedidos: 9 },
            { mesCriacao: "202610", qtdePedidos: 5 }
        ], fnText);
        assert.deepEqual(aRows.map(function (o) { return o.label; }), ["10/2025", "10/2026", "11/2026"]);
    });

    QUnit.test("shapeRows soma linhas da mesma chave (moedas diferentes) e tira a média das médias", function (assert) {
        var aSum = AnalyticsQuery.shapeRows(Scenarios.getScenario("PedValorPorStatus"), [
            { statusPedido: "ABERTO", statusPedidoTexto: "Aberto", valorTotal: 10, currency: "BRL" },
            { statusPedido: "ABERTO", statusPedidoTexto: "Aberto", valorTotal: 5, currency: "USD" }
        ], fnText);
        assert.strictEqual(aSum.length, 1);
        assert.strictEqual(aSum[0].values.valorTotal, 15);

        var aAvg = AnalyticsQuery.shapeRows(Scenarios.getScenario("PedTicketMedio"), [
            { statusPedido: "ABERTO", statusPedidoTexto: "Aberto", valorMedio: 10, currency: "BRL" },
            { statusPedido: "ABERTO", statusPedidoTexto: "Aberto", valorMedio: 20, currency: "USD" }
        ], fnText);
        assert.strictEqual(aAvg[0].values.valorMedio, 15);
    });

    QUnit.test("shapeRows sem dados devolve lista vazia", function (assert) {
        assert.deepEqual(AnalyticsQuery.shapeRows(Scenarios.getScenario("PedPorMes"), undefined, fnText), []);
    });

    QUnit.test("shapeKpis soma entre moedas e usa a primeira moeda", function (assert) {
        var oKpis = AnalyticsQuery.shapeKpis(oDomain, [
            { valorTotal: "100", qtdePedidos: 2, valorMedio: "50", currency: "BRL" }
        ]);
        assert.deepEqual(oKpis.values, { valorTotal: 100, qtdePedidos: 2, valorMedio: 50 });
        assert.strictEqual(oKpis.currency, "BRL");
    });

    QUnit.test("opções de filtro: meses cronológicos, demais por texto", function (assert) {
        var aMonths = AnalyticsQuery.shapeFilterValues({ field: "mesCriacao", type: "list" }, [
            { mesCriacao: "202701" }, { mesCriacao: "202612" }
        ], fnText);
        assert.deepEqual(aMonths.map(function (o) { return o.key; }), ["202612", "202701"]);
        var aStatus = AnalyticsQuery.shapeFilterValues({ field: "statusPedido", type: "list" }, [
            { statusPedido: "B", statusPedidoTexto: "Zeta" }, { statusPedido: "A", statusPedidoTexto: "Alfa" }
        ], fnText);
        assert.deepEqual(aStatus.map(function (o) { return o.text; }), ["Alfa", "Zeta"]);
    });
});
