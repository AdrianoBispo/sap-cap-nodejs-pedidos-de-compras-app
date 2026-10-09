sap.ui.define(function () {
    "use strict";

    return {
        name: "QUnit TestSuite for analiseclientes",
        defaults: {
            page: "ui5://test-resources/analiseclientes/Test.qunit.html?testsuite={suite}&test={name}",
            qunit: {
                version: 2
            },
            ui5: {
                theme: "sap_horizon"
            },
            loader: {
                paths: {
                    "analiseclientes": "../"
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
