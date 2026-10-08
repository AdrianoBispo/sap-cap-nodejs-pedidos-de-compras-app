/*global QUnit*/
sap.ui.define([
    "analisecompras/model/AnalyticsQuery",
    "analisecompras/model/Scenarios"
], function (AnalyticsQuery, Scenarios) {
    "use strict";

    var fnText = function (sKey) { return "T:" + sKey; };

    QUnit.module("AnalyticsQuery - consultas");

    QUnit.test("cenário com medida monetária agrupa por dimensão, texto e Currency", function (assert) {
        var oQuery = AnalyticsQuery.buildScenarioQuery(Scenarios.getScenario("PedValorPorStatus"), {});
        assert.strictEqual(oQuery.entitySet, "PedidosAnalise");
        assert.deepEqual(Object.keys(oQuery.aggregation.group), ["statusPedido", "statusPedidoTexto", "currency"]);
        assert.deepEqual(Object.keys(oQuery.aggregation.aggregate), ["valorTotal"]);
        assert.deepEqual(oQuery.filters, []);
    });

    QUnit.test("cenário de quantidade não agrupa por Currency", function (assert) {
        var oQuery = AnalyticsQuery.buildScenarioQuery(Scenarios.getScenario("PedPorMes"), {});
        assert.deepEqual(Object.keys(oQuery.aggregation.group), ["mesCriacao"]);
        assert.deepEqual(Object.keys(oQuery.aggregation.aggregate), ["qtdePedidos"]);
    });

    QUnit.test("cenário com duas medidas agrega as duas", function (assert) {
        var oQuery = AnalyticsQuery.buildScenarioQuery(Scenarios.getScenario("EstDisponivelPorCategoria"), {});
        assert.strictEqual(oQuery.entitySet, "ItensAnalise");
        assert.deepEqual(Object.keys(oQuery.aggregation.aggregate), ["qtdeReservada", "qtdeDisponivel"]);
        assert.deepEqual(Object.keys(oQuery.aggregation.group), ["categoria", "categoriaTexto"]);
    });

    QUnit.test("KPIs: aggregate sem dimensão, por moeda quando há valor monetário", function (assert) {
        var oPedidos = AnalyticsQuery.buildKpiQuery(Scenarios.getDomain("pedidos"), {});
        assert.deepEqual(Object.keys(oPedidos.aggregation.group), ["currency"]);
        assert.deepEqual(Object.keys(oPedidos.aggregation.aggregate), ["valorTotal", "qtdePedidos", "valorMedio"]);
        var oClientes = AnalyticsQuery.buildKpiQuery(Scenarios.getDomain("clientes"), {});
        assert.deepEqual(oClientes.aggregation.group, {});
    });

    QUnit.test("valores de filtro: grupo do campo com o texto", function (assert) {
        var oDomain = Scenarios.getDomain("pedidos");
        var oQuery = AnalyticsQuery.buildFilterValuesQuery(oDomain, oDomain.filters[0]);
        assert.deepEqual(Object.keys(oQuery.aggregation.group), ["statusPedido", "statusPedidoTexto"]);
    });

    QUnit.module("AnalyticsQuery - filtros");

    QUnit.test("list vira OR dentro do campo; vazio não filtra", function (assert) {
        var aDefs = Scenarios.getDomain("pedidos").filters;
        var aFilters = AnalyticsQuery.buildFilters({ StatusPedido: ["ABERTO", "CANCELADO"], Uf: [] }, aDefs);
        assert.deepEqual(aFilters, [{ path: "statusPedido", operator: "EQ", values: ["ABERTO", "CANCELADO"] }]);
        assert.deepEqual(AnalyticsQuery.buildFilters(undefined, aDefs), []);
    });

    QUnit.test("boolean e search", function (assert) {
        var aDefs = Scenarios.getDomain("clientes").filters;
        var aFilters = AnalyticsQuery.buildFilters({ ClienteAtivo: "false", Nome: "  ana " }, aDefs);
        assert.deepEqual(aFilters, [
            { path: "clienteAtivo", operator: "EQ", values: [false] },
            { path: "nome", operator: "Contains", values: ["ana"] }
        ]);
        assert.deepEqual(AnalyticsQuery.buildFilters({ ClienteAtivo: "", Nome: "   " }, aDefs), []);
    });

    QUnit.test("filtros de outro domínio são ignorados", function (assert) {
        var aDefs = Scenarios.getDomain("reembolsos").filters;
        assert.deepEqual(AnalyticsQuery.buildFilters({ Genero: ["F"] }, aDefs), []);
    });

    QUnit.module("AnalyticsQuery - linhas");

    QUnit.test("texto da dimensão: descrição, mês, faixa e vazio", function (assert) {
        assert.strictEqual(AnalyticsQuery.dimensionText("statusPedido", { StatusPedido: "ABERTO", StatusPedidoTexto: "Aberto" }, fnText), "Aberto");
        assert.strictEqual(AnalyticsQuery.dimensionText("mesCriacao", { MesCriacao: "202610" }, fnText), "10/2026");
        assert.strictEqual(AnalyticsQuery.dimensionText("faixaScore", { FaixaScore: "ALTO" }, fnText), "T:faixaALTO");
        assert.strictEqual(AnalyticsQuery.dimensionText("uf", { Uf: "" }, fnText), "-");
        assert.strictEqual(AnalyticsQuery.dimensionText("uf", { Uf: "SP" }, fnText), "SP");
    });

    QUnit.test("shapeRows ordena por medida decrescente", function (assert) {
        var aRows = AnalyticsQuery.shapeRows(Scenarios.getScenario("PedValorPorUf"), [
            { Uf: "RJ", ValorTotal: "10.50", Currency: "BRL" },
            { Uf: "SP", ValorTotal: "99", Currency: "BRL" },
            { Uf: "MG", ValorTotal: 30, Currency: "BRL" }
        ], fnText);
        assert.deepEqual(aRows.map(function (o) { return o.key; }), ["SP", "MG", "RJ"]);
        assert.strictEqual(aRows[2].values.ValorTotal, 10.5, "decimal vem como string");
        assert.strictEqual(aRows[0].currency, "BRL");
    });

    QUnit.test("shapeRows ordena meses cronologicamente", function (assert) {
        var aRows = AnalyticsQuery.shapeRows(Scenarios.getScenario("PedPorMes"), [
            { MesCriacao: "202611", QtdePedidos: 2 },
            { MesCriacao: "202510", QtdePedidos: 9 },
            { MesCriacao: "202610", QtdePedidos: 5 }
        ], fnText);
        assert.deepEqual(aRows.map(function (o) { return o.label; }), ["10/2025", "10/2026", "11/2026"]);
    });

    QUnit.test("shapeRows soma linhas da mesma chave (moedas diferentes) e tira a média das médias", function (assert) {
        var aSum = AnalyticsQuery.shapeRows(Scenarios.getScenario("PedValorPorStatus"), [
            { StatusPedido: "ABERTO", StatusPedidoTexto: "Aberto", ValorTotal: 10, Currency: "BRL" },
            { StatusPedido: "ABERTO", StatusPedidoTexto: "Aberto", ValorTotal: 5, Currency: "USD" }
        ], fnText);
        assert.strictEqual(aSum.length, 1);
        assert.strictEqual(aSum[0].values.ValorTotal, 15);

        var aAvg = AnalyticsQuery.shapeRows(Scenarios.getScenario("PedTicketMedio"), [
            { StatusPedido: "ABERTO", StatusPedidoTexto: "Aberto", ValorMedio: 10, Currency: "BRL" },
            { StatusPedido: "ABERTO", StatusPedidoTexto: "Aberto", ValorMedio: 20, Currency: "USD" }
        ], fnText);
        assert.strictEqual(aAvg[0].values.ValorMedio, 15);
    });

    QUnit.test("shapeRows limita ao top do cenário", function (assert) {
        var aRaw = [];
        for (var i = 1; i <= 15; i++) {
            aRaw.push({ Nome: "Item " + i, QtdeReservada: i });
        }
        var aRows = AnalyticsQuery.shapeRows(Scenarios.getScenario("EstMaisReservados"), aRaw, fnText);
        assert.strictEqual(aRows.length, 10);
        assert.strictEqual(aRows[0].label, "Item 15");
        assert.strictEqual(aRows[9].label, "Item 6");
    });

    QUnit.test("shapeRows ordena o estoque por Disponível, não pela 1ª medida", function (assert) {
        var aRows = AnalyticsQuery.shapeRows(Scenarios.getScenario("EstDisponivelPorCategoria"), [
            { Categoria: "A", CategoriaTexto: "A", QtdeReservada: 100, QtdeDisponivel: 1 },
            { Categoria: "B", CategoriaTexto: "B", QtdeReservada: 1, QtdeDisponivel: 50 }
        ], fnText);
        assert.deepEqual(aRows.map(function (o) { return o.key; }), ["B", "A"]);
    });

    QUnit.test("shapeRows sem dados devolve lista vazia", function (assert) {
        assert.deepEqual(AnalyticsQuery.shapeRows(Scenarios.getScenario("PedPorMes"), undefined, fnText), []);
    });

    QUnit.test("shapeKpis soma entre moedas e usa a primeira moeda", function (assert) {
        var oKpis = AnalyticsQuery.shapeKpis(Scenarios.getDomain("pedidos"), [
            { ValorTotal: "100", QtdePedidos: 2, ValorMedio: "50", Currency: "BRL" }
        ]);
        assert.deepEqual(oKpis.values, { ValorTotal: 100, QtdePedidos: 2, ValorMedio: 50 });
        assert.strictEqual(oKpis.currency, "BRL");
        var oEmpty = AnalyticsQuery.shapeKpis(Scenarios.getDomain("clientes"), []);
        assert.deepEqual(oEmpty.values, { QtdeClientes: 0, ScoreMedio: 0 });
    });

    QUnit.test("opções de filtro: meses cronológicos, demais por texto", function (assert) {
        var oMonth = { field: "mesCriacao", type: "list" };
        var aMonths = AnalyticsQuery.shapeFilterValues(oMonth, [
            { MesCriacao: "202701" }, { MesCriacao: "202612" }
        ], fnText);
        assert.deepEqual(aMonths.map(function (o) { return o.key; }), ["202612", "202701"]);
        var oStatus = { field: "statusPedido", type: "list" };
        var aStatus = AnalyticsQuery.shapeFilterValues(oStatus, [
            { StatusPedido: "B", StatusPedidoTexto: "Zeta" }, { StatusPedido: "A", StatusPedidoTexto: "Alfa" }
        ], fnText);
        assert.deepEqual(aStatus.map(function (o) { return o.text; }), ["Alfa", "Zeta"]);
    });
});
