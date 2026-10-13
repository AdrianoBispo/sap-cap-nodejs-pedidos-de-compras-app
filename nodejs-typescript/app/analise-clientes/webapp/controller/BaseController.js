/*
 * Base dos controllers do painel e do detalhe: atalhos para roteador, modelos,
 * textos, serviço de consultas, barra de filtros e navegação para o app de
 * gestão do domínio.
 */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "../control/FilterBar",
    "../model/Scenarios"
], function (Controller, MessageToast, FilterBar, Scenarios) {
    "use strict";

    return Controller.extend("analiseclientes.controller.BaseController", {
        /**
         * Roteador do componente.
         * @returns {sap.m.routing.Router}
         */
        getRouter: function () {
            return this.getOwnerComponent().getRouter();
        },

        /**
         * Modelo da view pelo nome.
         * @param {string} [sName] nome do modelo (sem nome: modelo OData padrão)
         * @returns {sap.ui.model.Model}
         */
        getModel: function (sName) {
            return this.getView().getModel(sName);
        },

        /**
         * Define um modelo na view.
         * @param {sap.ui.model.Model} oModel
         * @param {string} [sName]
         */
        setModel: function (oModel, sName) {
            return this.getView().setModel(oModel, sName);
        },

        /**
         * Modelo "state" do componente (domínio, filtros, KPIs e cards).
         * @returns {sap.ui.model.json.JSONModel}
         */
        getState: function () {
            return this.getOwnerComponent().getModel("state");
        },

        /**
         * Serviço de consultas analíticas do componente.
         * @returns {analiseclientes.service.AnalyticsService}
         */
        getService: function () {
            return this.getOwnerComponent().getService();
        },

        /**
         * Texto do i18n do app.
         * @param {string} sKey chave
         * @param {any[]} [aArgs] parâmetros posicionais
         * @returns {string}
         */
        getText: function (sKey, aArgs) {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
        },

        /**
         * Valores atuais dos filtros do domínio, por campo.
         * @param {string} sDomain chave do domínio
         * @returns {object}
         */
        getFilterValues: function (sDomain) {
            return this.getState().getProperty("/filters/" + sDomain) || {};
        },

        /**
         * (Re)monta a barra de filtros do domínio no container. Os valores vivem no modelo
         * "state" (/filters/<domínio>/<campo>) e sobrevivem à navegação painel <-> detalhe.
         * @param {sap.m.FlexBox} oBox container
         * @param {string} sDomain chave do domínio
         * @param {function} fnChanged chamada depois que um filtro muda
         */
        buildFilterBar: function (oBox, sDomain, fnChanged) {
            FilterBar.build(oBox, Scenarios.getDomain(sDomain), {
                state: this.getState(),
                service: this.getService(),
                getText: this.getText.bind(this),
                onChange: fnChanged,
                onLoadError: function (sLabel) {
                    MessageToast.show(this.getText("filterLoadError", [sLabel]));
                }.bind(this)
            });
        },

        /**
         * Abre o app de gestão do domínio: navegação semântica quando há launchpad;
         * fora dele, o app irmão servido pelo mesmo servidor CAP, em outra aba.
         * @param {string} sDomain chave do domínio
         */
        openManageApp: function (sDomain) {
            var oManage = Scenarios.getDomain(sDomain).manage;
            var Container = sap.ui.require("sap/ushell/Container");
            if (Container) {
                var aIntent = oManage.intent.split("-");
                Container.getServiceAsync("Navigation").then(function (oNavigation) {
                    return oNavigation.navigate({ target: { semanticObject: aIntent[0], action: aIntent[1] } });
                });
            } else {
                window.open("../" + oManage.app + "/index.html", "_blank", "noopener");
            }
        },

        /** Volta para o painel. */
        onNavBack: function () {
            this.getRouter().navTo("home", {}, true);
        }
    });
});
