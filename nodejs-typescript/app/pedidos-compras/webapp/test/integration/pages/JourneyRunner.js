sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"pedidoscompras/test/integration/pages/PedidosList.gen",
	"pedidoscompras/test/integration/pages/PedidosObjectPage.gen"
], function (JourneyRunner, PedidosListGenerated, PedidosObjectPageGenerated) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('pedidoscompras') + '/test/flp.html#app-preview',
        pages: {
			onThePedidosListGenerated: PedidosListGenerated,
			onThePedidosObjectPageGenerated: PedidosObjectPageGenerated
        },
        async: true
    });

    return runner;
});

