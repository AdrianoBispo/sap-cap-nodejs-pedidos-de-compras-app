sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "../control/FilterBar",
    "../model/Scenarios"
], function (Controller, MessageToast, FilterBar, Scenarios) {
    "use strict";

    return Controller.extend("analiseestoque.controller.BaseController", {
        getRouter: function () {
            return this.getOwnerComponent().getRouter();
        },

        getModel: function (sName) {
            return this.getView().getModel(sName);
        },

        setModel: function (oModel, sName) {
            return this.getView().setModel(oModel, sName);
        },

        getState: function () {
            return this.getOwnerComponent().getModel("state");
        },

        getService: function () {
            return this.getOwnerComponent().getService();
        },

        getText: function (sKey, aArgs) {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
        },

        /** Valores atuais dos filtros do domínio, por campo. */
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
         * fora dele, a BSP irmã (mesmo servidor ABAP) em outra aba.
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

        onNavBack: function () {
            this.getRouter().navTo("home", {}, true);
        }
    });
});
