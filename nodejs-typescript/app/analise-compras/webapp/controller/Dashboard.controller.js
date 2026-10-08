sap.ui.define([
    "./BaseController",
    "../model/Scenarios",
    "../model/formatter"
], function (BaseController, Scenarios, formatter) {
    "use strict";

    return BaseController.extend("analisecompras.controller.Dashboard", {
        onInit: function () {
            this._token = 0;
            this._shown = null;
            this.getState().setProperty("/domains", Scenarios.domains.map(function (oDomain) {
                return { key: oDomain.key, text: this.getText("domain" + oDomain.key), icon: oDomain.icon };
            }, this));
            ["home", "dashboard"].forEach(function (sRoute) {
                this.getRouter().getRoute(sRoute).attachPatternMatched(this._onMatched, this);
            }, this);
        },

        _onMatched: function (oEvent) {
            var oState = this.getState();
            var sDomain = oEvent.getParameter("arguments").domain || oState.getProperty("/domain");
            if (!Scenarios.getDomain(sDomain)) {
                this.getRouter().navTo("home", {}, true);
                return;
            }
            oState.setProperty("/domain", sDomain);
            oState.setProperty("/manageTooltip", this.getText("openManageTooltip", [this.getText("domain" + sDomain)]));
            if (sDomain !== this._shown) {
                this._shown = sDomain;
                oState.setProperty("/kpis", []);
                oState.setProperty("/cards", Scenarios.getScenariosOf(sDomain).map(this._toCard, this));
            }
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
            var sDomain = this.getState().getProperty("/domain");
            this.buildFilterBar(this.byId("filterBox"), sDomain, this._load.bind(this));
        },

        _load: function () {
            var oState = this.getState();
            var sDomain = oState.getProperty("/domain");
            var oDomain = Scenarios.getDomain(sDomain);
            var mFilters = this.getFilterValues(sDomain);
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
            var aScenarios = Scenarios.getScenariosOf(sDomain);
            aScenarios.forEach(function (oScenario, i) {
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

        onDomainChange: function (oEvent) {
            this.getRouter().navTo("dashboard", { domain: oEvent.getParameter("item").getKey() });
        },

        onDomainSelect: function (oEvent) {
            this.getRouter().navTo("dashboard", { domain: oEvent.getParameter("selectedItem").getKey() });
        },

        onRefresh: function () {
            this.getService().resetCache();
            this._refreshFilters();
            this._load();
        },

        onOpenManage: function () {
            this.openManageApp(this.getState().getProperty("/domain"));
        },

        onCardPress: function (oEvent) {
            var sId = oEvent.getSource().getBindingContext("state").getProperty("id");
            this.getRouter().navTo("detail", { scenario: sId });
        }
    });
});
