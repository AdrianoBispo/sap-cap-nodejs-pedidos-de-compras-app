/* Cria o shell do launchpad local depois do bootstrap do SAPUI5. */
sap.ui.define(["sap/ushell/Container"], function (Container) {
    "use strict";
    Container.createRenderer("fiori2", true).then(function (oRenderer) {
        oRenderer.placeAt("content");
    });
});
