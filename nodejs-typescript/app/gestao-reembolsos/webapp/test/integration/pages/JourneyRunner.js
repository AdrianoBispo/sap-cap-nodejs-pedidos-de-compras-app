sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"gestaoreembolsos/test/integration/pages/ReembolsosList.gen",
	"gestaoreembolsos/test/integration/pages/ReembolsosObjectPage.gen"
], function (JourneyRunner, ReembolsosListGenerated, ReembolsosObjectPageGenerated) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('gestaoreembolsos') + '/test/flp.html#app-preview',
        pages: {
			onTheReembolsosListGenerated: ReembolsosListGenerated,
			onTheReembolsosObjectPageGenerated: ReembolsosObjectPageGenerated
        },
        async: true
    });

    return runner;
});

