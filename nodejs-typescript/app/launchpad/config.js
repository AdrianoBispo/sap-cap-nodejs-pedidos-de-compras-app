/*
 * Configuração do launchpad local (sandbox do SAP Fiori launchpad): um tile
 * por aplicação. Os intents (objeto semântico + ação) são os mesmos dos
 * inbounds dos manifests, o que habilita a navegação entre as aplicações
 * (ex.: cliente e item do pedido abrem as apps de Clientes e Estoque).
 *
 * A resolução de intents no cliente (ClientSideTargetResolution) precisa estar
 * ligada: sem ela o shell não informa os objetos semânticos disponíveis e o
 * Fiori Elements esconde os links baseados em @Common.SemanticObject (Cliente,
 * CPF, Item, SKU). O adaptador local converte "applications" em inbounds.
 */
window["sap-ushell-config"] = {
    defaultRenderer: "fiori2",
    services: {
        NavTargetResolutionInternal: {
            config: { enableClientSideTargetResolution: true }
        }
    },
    renderers: {
        fiori2: {
            componentData: {
                config: { enableSearch: false, rootIntent: "Shell-home" }
            }
        }
    },
    applications: {
        "Cliente-manage": {
            title: "Gestão de Clientes",
            description: "Clientes e endereços",
            icon: "sap-icon://customer",
            additionalInformation: "SAPUI5.Component=gestaoclientes",
            applicationType: "URL",
            url: "/gestaoclientes"
        },
        "ItemEstoque-manage": {
            title: "Gestão de Estoque",
            description: "Itens, SKU e disponibilidade",
            icon: "sap-icon://product",
            additionalInformation: "SAPUI5.Component=gestaoestoque",
            applicationType: "URL",
            url: "/gestaoestoque"
        },
        "PedidoCompra-manage": {
            title: "Pedidos de Compras",
            description: "Pedidos, pagamento e cancelamento",
            icon: "sap-icon://sales-order",
            additionalInformation: "SAPUI5.Component=pedidoscompras",
            applicationType: "URL",
            url: "/pedidoscompras"
        },
        "Reembolso-manage": {
            title: "Gestão de Reembolsos",
            description: "Aprovar ou rejeitar reembolsos",
            icon: "sap-icon://money-bills",
            additionalInformation: "SAPUI5.Component=gestaoreembolsos",
            applicationType: "URL",
            url: "/gestaoreembolsos"
        },
        "AnaliseCompras-display": {
            title: "Análises de Compras",
            description: "Indicadores e gráficos",
            icon: "sap-icon://business-objects-experience",
            additionalInformation: "SAPUI5.Component=analisecompras",
            applicationType: "URL",
            url: "/analisecompras"
        }
    }
};
