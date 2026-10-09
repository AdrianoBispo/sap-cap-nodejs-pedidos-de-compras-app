sap.ui.define(function () {
    "use strict";

    return {
        name: "QUnit TestSuite for analiseestoque",
        defaults: {
            page: "ui5://test-resources/analiseestoque/Test.qunit.html?testsuite={suite}&test={name}",
            qunit: {
                version: 2
            },
            ui5: {
                theme: "sap_horizon"
            },
            loader: {
                paths: {
                    "analiseestoque": "../"
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
