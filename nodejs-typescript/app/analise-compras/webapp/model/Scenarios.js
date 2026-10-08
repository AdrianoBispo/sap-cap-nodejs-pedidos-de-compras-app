/*
 * Catálogo das análises: 4 domínios (um entity set cada, do serviço AnaliticoService) e os
 * 20 cenários de gráfico que antes eram apps separados (analise-* e painel-compras).
 *
 * Os campos vêm do $metadata de AnaliticoService (CAP). As medidas usam a agregação padrão do
 * backend (@Aggregation.default; no OData são "custom aggregates"), por isso o $apply é
 * aggregate(Medida) sem método explícito.
 */
sap.ui.define([], function () {
    "use strict";

    // Medidas: kind define a formatação; avg indica média (não soma) ao juntar linhas duplicadas;
    // currency indica que a medida depende de Currency (Currency entra no groupby).
    var MEASURES = {
        valorTotal: { kind: "money", currency: true, labelKey: "measureValorTotal" },
        valorMedio: { kind: "money", currency: true, avg: true, labelKey: "measureValorMedio" },
        qtdePedidos: { kind: "int", labelKey: "measureQtdePedidos" },
        qtdeClientes: { kind: "int", labelKey: "measureQtdeClientes" },
        scoreMedio: { kind: "dec", avg: true, labelKey: "measureScoreMedio" },
        qtdeEstoque: { kind: "int", labelKey: "measureQtdeEstoque" },
        qtdeReservada: { kind: "int", labelKey: "measureQtdeReservada" },
        qtdeDisponivel: { kind: "int", labelKey: "measureQtdeDisponivel" },
        valorEstoque: { kind: "money", labelKey: "measureValorEstoque" },
        qtdeItens: { kind: "int", labelKey: "measureQtdeItens" },
        valorReembolso: { kind: "money", currency: true, labelKey: "measureValorReembolso" },
        qtdeReembolsos: { kind: "int", labelKey: "measureQtdeReembolsos" }
    };

    // Dimensões: text = campo com a descrição; kind = month (AAAAMM) | faixa (BAIXO/MEDIO/ALTO).
    var DIMENSIONS = {
        statusPedido: { text: "statusPedidoTexto", labelKey: "dimStatusPedido" },
        statusPagamento: { text: "statusPagamentoTexto", labelKey: "dimStatusPagamento" },
        mesCriacao: { kind: "month", labelKey: "dimMesCriacao" },
        genero: { text: "generoTexto", labelKey: "dimGenero" },
        faixaScore: { kind: "faixa", labelKey: "dimFaixaScore" },
        mesCadastro: { kind: "month", labelKey: "dimMesCadastro" },
        categoria: { text: "categoriaTexto", labelKey: "dimCategoria" },
        statusEstoque: { text: "statusEstoqueTexto", labelKey: "dimStatusEstoque" },
        nome: { labelKey: "dimNome" },
        sku: { labelKey: "dimSku" },
        statusReembolso: { text: "statusReembolsoTexto", labelKey: "dimStatusReembolso" },
        motivoSolicitacao: { labelKey: "dimMotivo" },
        mesSolicitacao: { kind: "month", labelKey: "dimMesSolicitacao" },
        uf: { labelKey: "dimUf" },
        clienteAtivo: { kind: "boolean", labelKey: "dimClienteAtivo" }
    };

    // Campos de filtro de cada domínio (UI.SelectionFields do serviço).
    // type: list = valores distintos lidos do serviço; boolean = Todos/Sim/Não; search = contém.
    var DOMAINS = [
        {
            key: "pedidos",
            entitySet: "PedidosAnalise",
            icon: "sap-icon://sales-order",
            manage: { intent: "PedidoCompra-manage", app: "pedidoscompras" },
            filters: [
                { field: "statusPedido", type: "list" },
                { field: "statusPagamento", type: "list" },
                { field: "uf", type: "list" },
                { field: "mesCriacao", type: "list" }
            ],
            kpis: ["valorTotal", "qtdePedidos", "valorMedio"]
        },
        {
            key: "clientes",
            entitySet: "ClientesAnalise",
            icon: "sap-icon://customer",
            manage: { intent: "Cliente-manage", app: "gestaoclientes" },
            filters: [
                { field: "genero", type: "list" },
                { field: "clienteAtivo", type: "boolean" },
                { field: "uf", type: "list" },
                { field: "faixaScore", type: "list" },
                { field: "nome", type: "search" }
            ],
            kpis: ["qtdeClientes", "scoreMedio"]
        },
        {
            key: "estoque",
            entitySet: "ItensAnalise",
            icon: "sap-icon://product",
            manage: { intent: "ItemEstoque-manage", app: "gestaoestoque" },
            filters: [
                { field: "categoria", type: "list" },
                { field: "statusEstoque", type: "list" },
                { field: "nome", type: "search" },
                { field: "sku", type: "search" }
            ],
            kpis: ["qtdeItens", "qtdeEstoque", "qtdeReservada", "qtdeDisponivel", "valorEstoque"]
        },
        {
            key: "reembolsos",
            entitySet: "ReembolsosAnalise",
            icon: "sap-icon://money-bills",
            manage: { intent: "Reembolso-manage", app: "gestaoreembolsos" },
            filters: [
                { field: "statusReembolso", type: "list" },
                { field: "uf", type: "list" },
                { field: "mesSolicitacao", type: "list" }
            ],
            kpis: ["qtdeReembolsos", "valorReembolso"]
        }
    ];

    // Cenários. sort: by = "measure" (1ª medida) ou "dimension"; desc; top limita as linhas.
    function sc(id, domain, dimension, measures, chart, sort, top) {
        return {
            id: id,
            domain: domain,
            dimension: dimension,
            measures: measures,
            chart: chart,
            sort: sort,
            top: top || 0
        };
    }
    var BY_MEASURE = { by: "measure", desc: true };
    var BY_DIMENSION = { by: "dimension", desc: false };

    var SCENARIOS = [
        sc("PedValorPorStatus", "pedidos", "statusPedido", ["valorTotal"], "column", BY_MEASURE),
        sc("PedPorMes", "pedidos", "mesCriacao", ["qtdePedidos"], "column", BY_DIMENSION),
        sc("PedValorPorUf", "pedidos", "uf", ["valorTotal"], "column", BY_MEASURE),
        sc("PedPorPagamento", "pedidos", "statusPagamento", ["qtdePedidos"], "donut", BY_MEASURE),
        sc("PedTicketMedio", "pedidos", "statusPedido", ["valorMedio"], "column", BY_MEASURE),

        sc("CliPorGenero", "clientes", "genero", ["qtdeClientes"], "donut", BY_MEASURE),
        sc("CliPorUf", "clientes", "uf", ["qtdeClientes"], "column", BY_MEASURE),
        sc("CliPorFaixaScore", "clientes", "faixaScore", ["qtdeClientes"], "donut", BY_MEASURE),
        sc("CliCadastrosPorMes", "clientes", "mesCadastro", ["qtdeClientes"], "column", BY_DIMENSION),
        sc("CliScorePorUf", "clientes", "uf", ["scoreMedio"], "column", BY_MEASURE),

        sc("EstDisponivelPorCategoria", "estoque", "categoria", ["qtdeReservada", "qtdeDisponivel"], "column", { by: "measure", desc: true, measure: "qtdeDisponivel" }),
        sc("EstItensPorSituacao", "estoque", "statusEstoque", ["qtdeItens"], "donut", BY_MEASURE),
        sc("EstValorPorCategoria", "estoque", "categoria", ["valorEstoque"], "column", BY_MEASURE),
        sc("EstMaisReservados", "estoque", "nome", ["qtdeReservada"], "column", BY_MEASURE, 10),
        sc("EstItensPorCategoria", "estoque", "categoria", ["qtdeItens"], "donut", BY_MEASURE),

        sc("ReeValorPorStatus", "reembolsos", "statusReembolso", ["valorReembolso"], "column", BY_MEASURE),
        sc("ReeQtdePorStatus", "reembolsos", "statusReembolso", ["qtdeReembolsos"], "donut", BY_MEASURE),
        sc("ReeValorPorMes", "reembolsos", "mesSolicitacao", ["valorReembolso"], "column", BY_DIMENSION),
        sc("ReeValorPorUf", "reembolsos", "uf", ["valorReembolso"], "column", BY_MEASURE),
        sc("ReePorMotivo", "reembolsos", "motivoSolicitacao", ["qtdeReembolsos"], "column", BY_MEASURE)
    ];

    return {
        measures: MEASURES,
        dimensions: DIMENSIONS,
        domains: DOMAINS,
        scenarios: SCENARIOS,

        getDomain: function (sKey) {
            return DOMAINS.find(function (oDomain) { return oDomain.key === sKey; });
        },
        getScenario: function (sId) {
            return SCENARIOS.find(function (oScenario) { return oScenario.id === sId; });
        },
        getScenariosOf: function (sDomain) {
            return SCENARIOS.filter(function (oScenario) { return oScenario.domain === sDomain; });
        }
    };
});
