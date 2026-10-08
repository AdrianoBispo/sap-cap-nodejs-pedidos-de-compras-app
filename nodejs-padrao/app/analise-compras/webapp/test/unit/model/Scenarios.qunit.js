/*global QUnit*/
sap.ui.define([
    "sap/base/i18n/ResourceBundle",
    "analisecompras/model/Scenarios"
], function (ResourceBundle, Scenarios) {
    "use strict";

    QUnit.module("Scenarios");

    QUnit.test("20 cenários, 5 por domínio, com ids únicos", function (assert) {
        assert.strictEqual(Scenarios.scenarios.length, 20);
        assert.strictEqual(Scenarios.domains.length, 4);
        Scenarios.domains.forEach(function (oDomain) {
            assert.strictEqual(Scenarios.getScenariosOf(oDomain.key).length, 5, oDomain.key);
        });
        var aIds = Scenarios.scenarios.map(function (oScenario) { return oScenario.id; });
        assert.strictEqual(new Set(aIds).size, 20, "ids únicos");
        assert.strictEqual(Scenarios.getScenario("PedPorMes").domain, "pedidos");
        assert.strictEqual(Scenarios.getScenario("inexistente"), undefined);
    });

    QUnit.test("cenários, filtros e KPIs só usam dimensões e medidas conhecidas", function (assert) {
        Scenarios.scenarios.forEach(function (oScenario) {
            assert.ok(Scenarios.getDomain(oScenario.domain), oScenario.id + ": domínio");
            assert.ok(Scenarios.dimensions[oScenario.dimension], oScenario.id + ": dimensão");
            oScenario.measures.forEach(function (sMeasure) {
                assert.ok(Scenarios.measures[sMeasure], oScenario.id + ": medida " + sMeasure);
            });
            assert.ok(["column", "bar", "line", "donut"].indexOf(oScenario.chart) >= 0, oScenario.id + ": gráfico");
        });
        Scenarios.domains.forEach(function (oDomain) {
            oDomain.filters.forEach(function (oFilter) {
                assert.ok(Scenarios.dimensions[oFilter.field], oDomain.key + ": filtro " + oFilter.field);
            });
            oDomain.kpis.forEach(function (sMeasure) {
                assert.ok(Scenarios.measures[sMeasure], oDomain.key + ": KPI " + sMeasure);
            });
        });
    });

    QUnit.test("todas as chaves de i18n usadas existem", function (assert) {
        var done = assert.async();
        ResourceBundle.create({
            url: sap.ui.require.toUrl("analisecompras/i18n/i18n.properties"),
            async: true,
            supportedLocales: [""],
            fallbackLocale: ""
        }).then(function (oBundle) {
            var aKeys = [];
            Object.keys(Scenarios.measures).forEach(function (s) { aKeys.push(Scenarios.measures[s].labelKey); });
            Object.keys(Scenarios.dimensions).forEach(function (s) { aKeys.push(Scenarios.dimensions[s].labelKey); });
            Scenarios.domains.forEach(function (oDomain) { aKeys.push("domain" + oDomain.key); });
            Scenarios.scenarios.forEach(function (oScenario) {
                aKeys.push(oScenario.id + ".title", oScenario.id + ".sub");
            });
            ["BAIXO", "MEDIO", "ALTO"].forEach(function (s) { aKeys.push("faixa" + s); });
            ["column", "bar", "line", "donut"].forEach(function (s) { aKeys.push("chartType" + s); });
            aKeys.forEach(function (sKey) {
                assert.ok(oBundle.hasText(sKey), sKey);
            });
            done();
        });
    });
});
