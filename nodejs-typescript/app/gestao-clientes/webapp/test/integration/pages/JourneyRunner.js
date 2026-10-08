sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"gestaoclientes/test/integration/pages/ClientesList.gen",
	"gestaoclientes/test/integration/pages/ClientesObjectPage.gen"
], function (JourneyRunner, ClientesListGenerated, ClientesObjectPageGenerated) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('gestaoclientes') + '/test/flp.html#app-preview',
        pages: {
			onTheClientesListGenerated: ClientesListGenerated,
			onTheClientesObjectPageGenerated: ClientesObjectPageGenerated
        },
        async: true
    });

    return runner;
});

