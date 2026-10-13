/* Componente Fiori Elements: páginas e rotas vêm do manifest.json. */
sap.ui.define(
    ["sap/fe/core/AppComponent"],
    function (Component) {
        "use strict";

        return Component.extend("gestaoestoque.Component", {
            metadata: {
                manifest: "json"
            }
        });
    }
);