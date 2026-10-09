sap.ui.define(function () {
    "use strict";

    return {
        name: "QUnit TestSuite for analisereembolsos",
        defaults: {
            page: "ui5://test-resources/analisereembolsos/Test.qunit.html?testsuite={suite}&test={name}",
            qunit: {
                version: 2
            },
            ui5: {
                theme: "sap_horizon"
            },
            loader: {
                paths: {
                    "analisereembolsos": "../"
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
