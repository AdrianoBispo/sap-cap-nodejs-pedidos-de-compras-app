sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"gestaoestoque/test/integration/pages/ItensList.gen",
	"gestaoestoque/test/integration/pages/ItensObjectPage.gen"
], function (JourneyRunner, ItensListGenerated, ItensObjectPageGenerated) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('gestaoestoque') + '/test/flp.html#app-preview',
        pages: {
			onTheItensListGenerated: ItensListGenerated,
			onTheItensObjectPageGenerated: ItensObjectPageGenerated
        },
        async: true
    });

    return runner;
});

