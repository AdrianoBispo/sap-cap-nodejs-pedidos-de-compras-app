/* Formatação dos valores das medidas no idioma da sessão. */
sap.ui.define(["sap/ui/core/format/NumberFormat"], function (NumberFormat) {
    "use strict";

    var DEFAULT_CURRENCY = "BRL";

    /**
     * Formata o valor de uma medida conforme o tipo (int | dec | money) no idioma da sessão.
     * Instâncias criadas a cada chamada: o locale pode mudar entre sessões e o custo é baixo.
     * @param {number} fValue
     * @param {string} sKind int | dec | money
     * @param {string} [sCurrency] moeda (padrão BRL)
     * @returns {string} "-" para valor ausente
     */
    function formatMeasure(fValue, sKind, sCurrency) {
        if (fValue === null || fValue === undefined || isNaN(fValue)) {
            return "-";
        }
        switch (sKind) {
            case "money":
                return NumberFormat.getCurrencyInstance({ currencyCode: false }).format(fValue, sCurrency || DEFAULT_CURRENCY);
            case "dec":
                return NumberFormat.getFloatInstance({ minFractionDigits: 2, maxFractionDigits: 2 }).format(fValue);
            default:
                return NumberFormat.getIntegerInstance({ groupingEnabled: true }).format(fValue);
        }
    }

    /**
     * Participação no total, em % com uma casa (0 quando o total é zero).
     * @param {number} fValue
     * @param {number} fTotal
     * @returns {string}
     */
    function formatShare(fValue, fTotal) {
        var fShare = fTotal ? fValue / fTotal : 0;
        return NumberFormat.getPercentInstance({ minFractionDigits: 1, maxFractionDigits: 1 }).format(fShare);
    }

    return {
        formatMeasure: formatMeasure,
        formatShare: formatShare
    };
});
