sap.ui.define(function () {
    "use strict";

    return {
        name: "QUnit TestSuite for analisepedidos",
        defaults: {
            page: "ui5://test-resources/analisepedidos/Test.qunit.html?testsuite={suite}&test={name}",
            qunit: {
                version: 2
            },
            ui5: {
                theme: "sap_horizon"
            },
            loader: {
                paths: {
                    "analisepedidos": "../"
                }
            }
        },
        tests: {
            "unit/model/Scenarios": {
                title: "Catálogo de cenários"
            },
            "unit/model/AnalyticsQuery": {
                title: "Consultas analíticas e moldagem das linhas"
            }
        }
    };
});
