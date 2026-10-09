sap.ui.define([
    "./BaseController",
    "../model/Scenarios",
    "../model/formatter"
], function (BaseController, Scenarios, formatter) {
    "use strict";

    return BaseController.extend("analisereembolsos.controller.Dashboard", {
        onInit: function () {
            this._token = 0;
            this._domain = Scenarios.domains[0].key;
            var oState = this.getState();
            oState.setProperty("/domain", this._domain);
            oState.setProperty("/manageTooltip", this.getText("openManageTooltip", [this.getText("domain" + this._domain)]));
            oState.setProperty("/cards", Scenarios.getScenariosOf(this._domain).map(this._toCard, this));
            this.getRouter().getRoute("home").attachPatternMatched(this._onMatched, this);
        },

        _onMatched: function () {
            // os filtros podem ter mudado na página de detalhe: remonta a barra e recarrega
            this._refreshFilters();
            this._load();
        },

        _toCard: function (oScenario) {
            return {
                id: oScenario.id,
                title: this.getText(oScenario.id + ".title"),
                subtitle: this.getText(oScenario.id + ".sub"),
                chart: oScenario.chart,
                dimensionLabel: this.getText(Scenarios.dimensions[oScenario.dimension].labelKey),
                measures: oScenario.measures.map(function (sMeasure) {
                    var oMeasure = Scenarios.measures[sMeasure];
                    return { name: sMeasure, label: this.getText(oMeasure.labelKey), kind: oMeasure.kind };
                }, this),
                rows: [],
                busy: true
            };
        },

        _refreshFilters: function () {
            this.buildFilterBar(this.byId("filterBox"), this._domain, this._load.bind(this));
        },

        _load: function () {
            var oState = this.getState();
            var oDomain = Scenarios.getDomain(this._domain);
            var mFilters = this.getFilterValues(this._domain);
            var iToken = ++this._token;
            var that = this;
            var sError = "";

            function fail(oError) {
                if (!sError && iToken === that._token) {
                    sError = (oError && oError.message) || String(oError);
                    oState.setProperty("/loadError", that.getText("loadError", [sError]));
                }
            }

            oState.setProperty("/loadError", "");
            Scenarios.getScenariosOf(this._domain).forEach(function (oScenario, i) {
                oState.setProperty("/cards/" + i + "/busy", true);
                that.getService().loadScenario(oScenario, mFilters).then(function (aRows) {
                    if (iToken === that._token) {
                        oState.setProperty("/cards/" + i + "/rows", aRows);
                    }
                }).catch(function (oError) {
                    if (iToken === that._token) {
                        oState.setProperty("/cards/" + i + "/rows", []);
                    }
                    fail(oError);
                }).finally(function () {
                    if (iToken === that._token) {
                        oState.setProperty("/cards/" + i + "/busy", false);
                    }
                });
            });

            this.getService().loadKpis(oDomain, mFilters).then(function (oKpis) {
                if (iToken === that._token) {
                    oState.setProperty("/kpis", oDomain.kpis.map(function (sMeasure) {
                        var oMeasure = Scenarios.measures[sMeasure];
                        return {
                            label: that.getText(oMeasure.labelKey),
                            value: formatter.formatMeasure(oKpis.values[sMeasure], oMeasure.kind, oKpis.currency)
                        };
                    }));
                }
            }).catch(fail);
        },

        onRefresh: function () {
            this.getService().resetCache();
            this._refreshFilters();
            this._load();
        },

        onOpenManage: function () {
            this.openManageApp(this._domain);
        },

        onCardPress: function (oEvent) {
            var sId = oEvent.getSource().getBindingContext("state").getProperty("id");
            this.getRouter().navTo("detail", { scenario: sId });
        }
    });
});
