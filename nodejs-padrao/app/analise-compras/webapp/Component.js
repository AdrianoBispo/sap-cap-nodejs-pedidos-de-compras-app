sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "sap/ui/model/json/JSONModel",
    "./model/Scenarios",
    "./service/AnalyticsService"
], function (UIComponent, Device, JSONModel, Scenarios, AnalyticsService) {
    "use strict";

    return UIComponent.extend("analisecompras.Component", {
        metadata: {
            manifest: "json",
            config: { fullWidth: true },
            interfaces: ["sap.ui.core.IAsyncContentCreation"]
        },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            // Estado compartilhado entre o painel e o detalhe: domínio atual e valores dos filtros.
            var mFilters = {};
            Scenarios.domains.forEach(function (oDomain) { mFilters[oDomain.key] = {}; });
            this.setModel(new JSONModel({ domain: Scenarios.domains[0].key, filters: mFilters }), "state");

            // Telas estreitas (celular e tablet em pé): o seletor de domínio vira uma lista suspensa.
            var oDevice = new JSONModel({ narrow: false });
            this._mediaHandler = function (mParams) {
                oDevice.setProperty("/narrow", mParams.from < 1024);
            };
            Device.media.attachHandler(this._mediaHandler, null, Device.media.RANGESETS.SAP_STANDARD);
            this._mediaHandler(Device.media.getCurrentRange(Device.media.RANGESETS.SAP_STANDARD));
            this.setModel(oDevice, "device");

            var oBundle = this.getModel("i18n").getResourceBundle();
            this._service = new AnalyticsService(this.getModel(), function (sKey) {
                return oBundle.getText(sKey);
            });

            this.getRouter().initialize();
        },

        getService: function () {
            return this._service;
        },

        destroy: function () {
            Device.media.detachHandler(this._mediaHandler, null, Device.media.RANGESETS.SAP_STANDARD);
            this._service.destroy();
            UIComponent.prototype.destroy.apply(this, arguments);
        }
    });
});
