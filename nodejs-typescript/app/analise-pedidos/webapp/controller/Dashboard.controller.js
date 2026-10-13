/*
 * Painel do app: barra de filtros, tiles de KPI e um card com gráfico por
 * cenário do domínio. As cargas concorrentes são descartadas por um token:
 * só a resposta da última carga atualiza a tela.
 */
sap.ui.define([
    "./BaseController",
    "../model/Scenarios",
    "../model/formatter"
], function (BaseController, Scenarios, formatter) {
    "use strict";

    return BaseController.extend("analisepedidos.controller.Dashboard", {
        /** Prepara os cards do domínio e escuta a rota "home". */
        onInit: function () {
            this._token = 0;
            this._domain = Scenarios.domains[0].key;
            var oState = this.getState();
            oState.setProperty("/domain", this._domain);
            oState.setProperty("/manageTooltip", this.getText("openManageTooltip", [this.getText("domain" + this._domain)]));
            oState.setProperty("/cards", Scenarios.getScenariosOf(this._domain).map(this._toCard, this));
            this.getRouter().getRoute("home").attachPatternMatched(this._onMatched, this);
        },

        /** Rota "home": os filtros podem ter mudado no detalhe, então remonta a barra e recarrega. */
        _onMatched: function () {
            this._refreshFilters();
            this._load();
        },

        /**
         * Card de um cenário (títulos, tipo de gráfico, dimensão e medidas), ainda sem linhas.
         * @param {object} oScenario cenário de Scenarios
         * @returns {object}
         */
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

        /** (Re)monta a barra de filtros; cada mudança recarrega o painel. */
        _refreshFilters: function () {
            this.buildFilterBar(this.byId("filterBox"), this._domain, this._load.bind(this));
        },

        /**
         * Carrega os cards e os KPIs com os filtros atuais. O primeiro erro é
         * exibido na faixa de mensagem; respostas de cargas antigas são ignoradas.
         */
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

        /** "Atualizar": descarta o cache das opções de filtro e recarrega tudo. */
        onRefresh: function () {
            this.getService().resetCache();
            this._refreshFilters();
            this._load();
        },

        /** Abre o app de gestão do domínio. */
        onOpenManage: function () {
            this.openManageApp(this._domain);
        },

        /**
         * Abre o detalhe do cenário do card clicado.
         * @param {sap.ui.base.Event} oEvent
         */
        onCardPress: function (oEvent) {
            var sId = oEvent.getSource().getBindingContext("state").getProperty("id");
            this.getRouter().navTo("detail", { scenario: sId });
        }
    });
});
