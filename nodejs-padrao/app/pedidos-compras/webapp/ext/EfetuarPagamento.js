/**
 * Ação "Efetuar Pagamento" (List Report e Object Page) com campos mascarados.
 *
 * O diálogo padrão de parâmetros do Fiori Elements usa campos de texto livre
 * (sap.ui.mdc.Field), sem máscara de digitação. Este diálogo usa
 * sap.m.MaskInput para o número do cartão (9999 9999 9999 9999), a validade
 * (MM/AA) e o CVV (999) e chama a mesma action vinculada
 * PedidosService.efetuarPagamento pelo editFlow, que trata mensagens, side
 * effects e a atualização da tela.
 *
 * Os dados do cartão existem só nos controles do diálogo, que é destruído ao
 * fechar; o backend continua validando tudo (formato, validade, CVV).
 */
sap.ui.define([
    "sap/m/Button",
    "sap/m/Dialog",
    "sap/m/Label",
    "sap/m/MaskInput",
    "sap/m/Select",
    "sap/m/VBox",
    "sap/ui/core/Item",
    "sap/ui/model/Sorter"
], function (Button, Dialog, Label, MaskInput, Select, VBox, Item, Sorter) {
    "use strict";

    /** Action vinculada chamada pelo diálogo. */
    const ACAO = "PedidosService.efetuarPagamento";
    /** Máscaras do sap.m.MaskInput: 9 = dígito. */
    const MASCARA = { cartao: "9999 9999 9999 9999", validade: "99/99", cvv: "999" };
    /** Caractere das posições ainda não digitadas. */
    const MARCADOR = "_";

    /**
     * Valor digitado no campo. Durante a digitação (liveChange) a propriedade
     * value ainda não foi atualizada: vale o último valor recebido no evento.
     * @param {sap.m.MaskInput} campo
     * @returns {string}
     */
    function valor(campo) {
        const digitado = campo.data("digitado");
        return digitado === null || digitado === undefined ? campo.getValue() : digitado;
    }

    /**
     * Campo mascarado preenchido em todas as posições.
     * @param {sap.m.MaskInput} campo
     * @returns {boolean}
     */
    function completo(campo) {
        const texto = valor(campo);
        return !!texto && texto.indexOf(MARCADOR) === -1;
    }

    /**
     * Remove a máscara (espaços, barra e marcadores), deixando só os dígitos.
     * @param {string} texto
     * @returns {string}
     */
    function somenteDigitos(texto) {
        return String(texto || "").replace(/\D/g, "");
    }

    /**
     * Pedidos em que o pagamento pode ser feito (status ABERTO).
     * @param {sap.ui.model.odata.v4.Context[]} contextos
     * @returns {sap.ui.model.odata.v4.Context[]}
     */
    function pedidosAbertos(contextos) {
        return (contextos || []).filter(function (contexto) {
            return contexto && contexto.getProperty("statusPedido_code") === "ABERTO";
        });
    }

    /**
     * Campo mascarado obrigatório.
     * @param {string} mascara máscara do MaskInput
     * @param {sap.base.i18n.ResourceBundle} textos i18n do app
     * @param {string} chavePlaceholder chave do texto de dica
     * @returns {sap.m.MaskInput}
     */
    function criarCampo(mascara, textos, chavePlaceholder) {
        return new MaskInput({
            mask: mascara,
            placeholderSymbol: MARCADOR,
            placeholder: textos.getText(chavePlaceholder),
            width: "100%",
            required: true
        });
    }

    /**
     * Monta e abre o diálogo de pagamento. Confirmar só fica habilitado com o
     * método escolhido e todos os campos completos (mês da validade de 01 a 12);
     * a action é chamada pelo editFlow, que exibe as mensagens do backend e
     * atualiza a tela.
     * @param {sap.fe.core.ExtensionAPI} extensionAPI API da página (List Report ou Object Page)
     * @param {sap.ui.model.odata.v4.Context[]} contextos pedidos ABERTO que receberão o pagamento
     */
    function abrirDialogo(extensionAPI, contextos) {
        let dialogo = null;
        const textos = extensionAPI.getModel("i18n").getResourceBundle();
        const metodo = new Select({
            width: "100%",
            required: true,
            forceSelection: false,
            items: {
                path: "/MetodosPagamento",
                sorter: new Sorter("ordem"),
                template: new Item({ key: "{code}", text: "{name}" })
            }
        });
        const cartao = criarCampo(MASCARA.cartao, textos, "pagamentoCartaoDica");
        const validade = criarCampo(MASCARA.validade, textos, "pagamentoValidadeDica");
        const cvv = criarCampo(MASCARA.cvv, textos, "pagamentoCvvDica");

        const rotulo = function (chave, campo) {
            return new Label({ text: textos.getText(chave), labelFor: campo, required: true }).addStyleClass("sapUiSmallMarginTop");
        };

        // Mês da validade entre 01 e 12 (o backend também confere o cartão expirado)
        const validadeValida = function () {
            if (!completo(validade)) {
                return false;
            }
            const mes = Number(valor(validade).slice(0, 2));
            return mes >= 1 && mes <= 12;
        };

        const confirmar = new Button({
            text: textos.getText("pagamentoConfirmar"),
            type: "Emphasized",
            enabled: false,
            press: async function () {
                dialogo.setBusy(true);
                try {
                    await extensionAPI.editFlow.invokeAction(ACAO, {
                        contexts: contextos,
                        skipParameterDialog: true,
                        parameterValues: [
                            { name: "metodoPagamento", value: metodo.getSelectedKey() },
                            { name: "numeroCartao", value: somenteDigitos(valor(cartao)) },
                            { name: "validade", value: valor(validade) },
                            { name: "cvv", value: somenteDigitos(valor(cvv)) }
                        ]
                    });
                    dialogo.close();
                } catch {
                    // O editFlow já exibiu as mensagens do backend; o diálogo fica aberto para correção
                } finally {
                    dialogo.setBusy(false);
                }
            }
        });

        const atualizar = function () {
            const mesOk = !completo(validade) || validadeValida();
            validade.setValueState(mesOk ? "None" : "Error");
            validade.setValueStateText(mesOk ? "" : textos.getText("pagamentoValidadeMes"));
            confirmar.setEnabled(!!metodo.getSelectedKey() && completo(cartao) && validadeValida() && completo(cvv));
        };
        [cartao, validade, cvv].forEach(function (campo) {
            const registrar = function (evento) {
                campo.data("digitado", evento.getParameter("value"));
                atualizar();
            };
            campo.attachLiveChange(registrar);
            campo.attachChange(registrar);
        });
        metodo.attachChange(atualizar);

        dialogo = new Dialog({
            title: textos.getText("pagamentoTitulo"),
            contentWidth: "26rem",
            content: [
                new VBox({
                    items: [
                        rotulo("pagamentoMetodo", metodo), metodo,
                        rotulo("pagamentoCartao", cartao), cartao,
                        rotulo("pagamentoValidade", validade), validade,
                        rotulo("pagamentoCvv", cvv), cvv
                    ]
                }).addStyleClass("sapUiSmallMargin")
            ],
            beginButton: confirmar,
            endButton: new Button({
                text: textos.getText("pagamentoCancelar"),
                press: function () {
                    dialogo.close();
                }
            }),
            afterClose: function () {
                dialogo.destroy();
            }
        });
        extensionAPI.addDependent(dialogo);
        dialogo.open();
    }

    return {
        /**
         * Handler da ação. Object Page: contexto da página; List Report: linhas
         * selecionadas (só as que estão em ABERTO recebem o pagamento).
         * @param {sap.ui.model.odata.v4.Context} contexto contexto da página
         * @param {sap.ui.model.odata.v4.Context[]} [contextosSelecionados] linhas selecionadas
         */
        abrir: function (contexto, contextosSelecionados) {
            const alvos = pedidosAbertos(contextosSelecionados && contextosSelecionados.length ? contextosSelecionados : [contexto]);
            if (alvos.length) {
                abrirDialogo(this, alvos);
            }
        },

        /**
         * Habilita a ação no List Report quando há pedido ABERTO selecionado.
         * @param {sap.ui.model.odata.v4.Context} _contexto contexto da página (não usado)
         * @param {sap.ui.model.odata.v4.Context[]} contextosSelecionados
         * @returns {boolean}
         */
        habilitado: function (_contexto, contextosSelecionados) {
            return pedidosAbertos(contextosSelecionados).length > 0;
        }
    };
});
