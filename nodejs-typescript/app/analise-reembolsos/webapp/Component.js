/*
 * Componente do app de análise: cria o modelo "state" (domínio e filtros
 * compartilhados entre o painel e o detalhe) e o AnalyticsService sobre o
 * modelo OData V4 do AnaliticoService.
 */
sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "./model/Scenarios",
    "./service/AnalyticsService"
], function (UIComponent, JSONModel, Scenarios, AnalyticsService) {
    "use strict";

    return UIComponent.extend("analisereembolsos.Component", {
        metadata: {
            manifest: "json",
            config: { fullWidth: true },
            interfaces: ["sap.ui.core.IAsyncContentCreation"]
        },

        /** Inicializa o estado compartilhado, o serviço de consultas e o roteador. */
        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            // Estado compartilhado entre o painel e o detalhe: domínio do app e valores dos filtros.
            var sDomain = Scenarios.domains[0].key;
            var mFilters = {};
            mFilters[sDomain] = {};
            this.setModel(new JSONModel({ domain: sDomain, filters: mFilters, kpis: [], cards: [] }), "state");

            var oBundle = this.getModel("i18n").getResourceBundle();
            this._service = new AnalyticsService(this.getModel(), function (sKey) {
                return oBundle.getText(sKey);
            });

            this.getRouter().initialize();
        },

        /**
         * Serviço de consultas analíticas do app.
         * @returns {analisereembolsos.service.AnalyticsService}
         */
        getService: function () {
            return this._service;
        },

        /** Libera o serviço de consultas junto com o componente. */
        destroy: function () {
            this._service.destroy();
            UIComponent.prototype.destroy.apply(this, arguments);
        }
    });
});
