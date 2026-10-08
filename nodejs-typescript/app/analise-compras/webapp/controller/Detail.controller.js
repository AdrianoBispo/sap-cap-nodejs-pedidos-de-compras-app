sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "../model/Scenarios",
    "../model/formatter"
], function (BaseController, JSONModel, Scenarios, formatter) {
    "use strict";

    var CHART_ICONS = {
        column: "sap-icon://vertical-bar-chart",
        bar: "sap-icon://horizontal-bar-chart",
        line: "sap-icon://line-chart",
        donut: "sap-icon://donut-chart"
    };

    return BaseController.extend("analisecompras.controller.Detail", {
        onInit: function () {
            this._token = 0;
            this.setModel(new JSONModel({ rows: [], tableRows: [], measures: [], chartTypes: [] }), "detail");
            this.getRouter().getRoute("detail").attachPatternMatched(this._onMatched, this);
        },

        _onMatched: function (oEvent) {
            var oScenario = Scenarios.getScenario(oEvent.getParameter("arguments").scenario);
            if (!oScenario) {
                this.getRouter().navTo("home", {}, true);
                return;
            }
            this._scenario = oScenario;
            this.getState().setProperty("/domain", oScenario.domain);

            var oDetail = this.getModel("detail");
            var aMeasures = oScenario.measures.map(function (sMeasure) {
                var oMeasure = Scenarios.measures[sMeasure];
                return { name: sMeasure, label: this.getText(oMeasure.labelKey), kind: oMeasure.kind };
            }, this);
            var bSingle = aMeasures.length === 1;
            var bAvg = oScenario.measures.some(function (sMeasure) { return Scenarios.measures[sMeasure].avg; });
            oDetail.setData({
                title: this.getText(oScenario.id + ".title"),
                subtitle: this.getText(oScenario.id + ".sub"),
                domainText: this.getText("domain" + oScenario.domain),
                dimensionLabel: this.getText(Scenarios.dimensions[oScenario.dimension].labelKey),
                measures: aMeasures,
                header1: aMeasures[0].label,
                header2: aMeasures[1] ? aMeasures[1].label : "",
                hasSecond: !bSingle,
                hasShare: bSingle && !bAvg,
                chart: oScenario.chart,
                chartTypes: Object.keys(CHART_ICONS).map(function (sType) {
                    return {
                        key: sType,
                        icon: CHART_ICONS[sType],
                        text: this.getText("chartType" + sType),
                        enabled: sType !== "donut" || bSingle
                    };
                }, this),
                rows: [],
                tableRows: [],
                countText: "",
                error: "",
                busy: true
            });

            this._refreshFilters();
            this._load();
        },

        _refreshFilters: function () {
            this.buildFilterBar(this.byId("filterBox"), this._scenario.domain, this._load.bind(this));
        },

        _load: function () {
            var oScenario = this._scenario;
            var oDetail = this.getModel("detail");
            var iToken = ++this._token;
            oDetail.setProperty("/busy", true);
            oDetail.setProperty("/error", "");

            this.getService().loadScenario(oScenario, this.getFilterValues(oScenario.domain)).then(function (aRows) {
                if (iToken !== this._token) {
                    return;
                }
                oDetail.setProperty("/rows", aRows);
                oDetail.setProperty("/tableRows", this._toTableRows(aRows));
                oDetail.setProperty("/countText", this.getText("rowsCount", [aRows.length]));
            }.bind(this)).catch(function (oError) {
                if (iToken === this._token) {
                    oDetail.setProperty("/rows", []);
                    oDetail.setProperty("/tableRows", []);
                    oDetail.setProperty("/countText", "");
                    oDetail.setProperty("/error", this.getText("loadError", [(oError && oError.message) || String(oError)]));
                }
            }.bind(this)).finally(function () {
                if (iToken === this._token) {
                    oDetail.setProperty("/busy", false);
                }
            }.bind(this));
        },

        /** Linhas da tabela: valores formatados, % do total (1 medida somável) e linha de total. */
        _toTableRows: function (aRows) {
            var aMeasures = this._scenario.measures;
            var oDetail = this.getModel("detail");
            var bShare = oDetail.getProperty("/hasShare");
            var bTotal = aRows.length > 1 && !aMeasures.some(function (sMeasure) { return Scenarios.measures[sMeasure].avg; });
            var aTotals = aMeasures.map(function (sMeasure) {
                return aRows.reduce(function (fSum, oRow) { return fSum + oRow.values[sMeasure]; }, 0);
            });

            function format(iMeasure, fValue, sCurrency) {
                return formatter.formatMeasure(fValue, Scenarios.measures[aMeasures[iMeasure]].kind, sCurrency);
            }

            var aTable = aRows.map(function (oRow) {
                return {
                    label: oRow.label,
                    value1: format(0, oRow.values[aMeasures[0]], oRow.currency),
                    value2: aMeasures[1] ? format(1, oRow.values[aMeasures[1]], oRow.currency) : "",
                    share: bShare ? formatter.formatShare(oRow.values[aMeasures[0]], aTotals[0]) : "",
                    total: false
                };
            });
            if (bTotal) {
                var sCurrency = aRows[0].currency;
                aTable.push({
                    label: this.getText("total"),
                    value1: format(0, aTotals[0], sCurrency),
                    value2: aMeasures[1] ? format(1, aTotals[1], sCurrency) : "",
                    share: bShare ? formatter.formatShare(aTotals[0], aTotals[0]) : "",
                    total: true
                });
            }
            return aTable;
        },

        onChartTypeChange: function (oEvent) {
            this.getModel("detail").setProperty("/chart", oEvent.getParameter("item").getKey());
        },

        onRefresh: function () {
            this.getService().resetCache();
            this._refreshFilters();
            this._load();
        }
    });
});
