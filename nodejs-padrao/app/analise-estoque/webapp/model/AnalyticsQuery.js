/*
 * Monta as consultas analíticas ($apply) e molda as linhas devolvidas. Sem dependência de
 * controles nem de modelo: devolve descritores simples que o AnalyticsService converte em
 * ODataListBinding + $$aggregation + Filter. Isso mantém a regra testável por unidade.
 */
sap.ui.define(["./Scenarios"], function (Scenarios) {
    "use strict";

    var CURRENCY = "currency";

    function dimensionFields(sDimension) {
        var oDimension = Scenarios.dimensions[sDimension] || {};
        return oDimension.text ? [sDimension, oDimension.text] : [sDimension];
    }

    function needsCurrency(aMeasures) {
        return aMeasures.some(function (sMeasure) {
            return (Scenarios.measures[sMeasure] || {}).currency;
        });
    }

    function toAggregation(aGroupFields, aMeasures) {
        var oGroup = {};
        var oAggregate = {};
        aGroupFields.forEach(function (sField) { oGroup[sField] = {}; });
        aMeasures.forEach(function (sMeasure) { oAggregate[sMeasure] = {}; });
        return { group: oGroup, aggregate: oAggregate };
    }

    /**
     * Converte os valores escolhidos na barra de filtros em condições do $apply/filter().
     * Dentro de um campo as condições são OR; entre campos, AND. Campo vazio não filtra.
     * @param {object} mValues valores por campo: array (list), "true"/"false"/"" (boolean) ou texto (search)
     * @param {object[]} aFilterDefs definições de filtro do domínio
     * @returns {{path: string, operator: string, values: any[]}[]}
     */
    function buildFilters(mValues, aFilterDefs) {
        var aConditions = [];
        (mValues ? aFilterDefs : []).forEach(function (oDef) {
            var vValue = mValues[oDef.field];
            if (oDef.type === "list" && Array.isArray(vValue) && vValue.length) {
                aConditions.push({ path: oDef.field, operator: "EQ", values: vValue.slice() });
            } else if (oDef.type === "boolean" && (vValue === "true" || vValue === "false")) {
                aConditions.push({ path: oDef.field, operator: "EQ", values: [vValue === "true"] });
            } else if (oDef.type === "search" && typeof vValue === "string" && vValue.trim()) {
                aConditions.push({ path: oDef.field, operator: "Contains", values: [vValue.trim()] });
            }
        });
        return aConditions;
    }

    /** Consulta de um cenário: groupby(dimensão[, texto][, Currency]) + aggregate(medidas). */
    function buildScenarioQuery(oScenario, mFilterValues) {
        var oDomain = Scenarios.getDomain(oScenario.domain);
        var aGroup = dimensionFields(oScenario.dimension);
        if (needsCurrency(oScenario.measures)) {
            aGroup.push(CURRENCY);
        }
        return {
            entitySet: oDomain.entitySet,
            aggregation: toAggregation(aGroup, oScenario.measures),
            filters: buildFilters(mFilterValues, oDomain.filters)
        };
    }

    /** Totais do domínio (KPIs): aggregate sem dimensão; por moeda quando há medida monetária. */
    function buildKpiQuery(oDomain, mFilterValues) {
        var aGroup = needsCurrency(oDomain.kpis) ? [CURRENCY] : [];
        return {
            entitySet: oDomain.entitySet,
            aggregation: toAggregation(aGroup, oDomain.kpis),
            filters: buildFilters(mFilterValues, oDomain.filters)
        };
    }

    /** Valores distintos de um campo de filtro (para os MultiComboBox). */
    function buildFilterValuesQuery(oDomain, oFilterDef) {
        return {
            entitySet: oDomain.entitySet,
            aggregation: { group: toAggregation(dimensionFields(oFilterDef.field), []).group },
            filters: []
        };
    }

    /** AAAAMM -> MM/AAAA */
    function formatMonth(sValue) {
        return /^\d{6}$/.test(sValue) ? sValue.substring(4) + "/" + sValue.substring(0, 4) : sValue;
    }

    /**
     * Texto exibido de um valor de dimensão.
     * @param {string} sDimension nome da dimensão
     * @param {object} oRow linha do serviço
     * @param {function(string):string} [fnText] resolve chaves de i18n (faixa de score)
     */
    function dimensionText(sDimension, oRow, fnText) {
        var oDimension = Scenarios.dimensions[sDimension] || {};
        var vValue = oRow[sDimension];
        if (oDimension.text && oRow[oDimension.text]) {
            return oRow[oDimension.text];
        }
        if (oDimension.kind === "month") {
            return formatMonth(String(vValue));
        }
        if (oDimension.kind === "faixa" && fnText) {
            return fnText("faixa" + vValue);
        }
        if (oDimension.kind === "boolean" && fnText) {
            return fnText(vValue ? "yes" : "no");
        }
        return vValue === null || vValue === undefined || vValue === "" ? "-" : String(vValue);
    }

    function compare(vA, vB) {
        if (vA === vB) {
            return 0;
        }
        return vA < vB ? -1 : 1;
    }

    /** Une linhas da mesma chave (moedas diferentes): soma, ou média para medidas "avg". */
    function mergeRows(aRows, sDimension, aMeasures, fnText) {
        var mByKey = {};
        var aOrder = [];
        aRows.forEach(function (oRow) {
            var sKey = String(oRow[sDimension]);
            var oEntry = mByKey[sKey];
            if (!oEntry) {
                oEntry = mByKey[sKey] = {
                    key: sKey,
                    label: dimensionText(sDimension, oRow, fnText),
                    currency: oRow[CURRENCY] || "",
                    values: {},
                    count: 0
                };
                aMeasures.forEach(function (sMeasure) { oEntry.values[sMeasure] = 0; });
                aOrder.push(sKey);
            }
            oEntry.count += 1;
            aMeasures.forEach(function (sMeasure) {
                oEntry.values[sMeasure] += Number(oRow[sMeasure]) || 0;
            });
        });
        return aOrder.map(function (sKey) {
            var oEntry = mByKey[sKey];
            aMeasures.forEach(function (sMeasure) {
                if ((Scenarios.measures[sMeasure] || {}).avg && oEntry.count > 1) {
                    oEntry.values[sMeasure] /= oEntry.count;
                }
            });
            return oEntry;
        });
    }

    /**
     * Linhas de um cenário prontas para gráfico/tabela: junta, ordena e limita (top).
     * @returns {{key:string,label:string,currency:string,values:object}[]}
     */
    function shapeRows(oScenario, aRawRows, fnText) {
        var aRows = mergeRows(aRawRows || [], oScenario.dimension, oScenario.measures, fnText);
        var oSort = oScenario.sort || {};
        var sMeasure = oSort.measure || oScenario.measures[0];
        var iDirection = oSort.desc ? -1 : 1;
        aRows.sort(function (a, b) {
            if (oSort.by === "measure") {
                return (a.values[sMeasure] - b.values[sMeasure]) * iDirection;
            }
            return compare(a.key, b.key) * iDirection;
        });
        return oScenario.top ? aRows.slice(0, oScenario.top) : aRows;
    }

    /** Totais do domínio: soma entre moedas (média para medidas "avg"). */
    function shapeKpis(oDomain, aRawRows) {
        var oTotals = {};
        var aRows = aRawRows || [];
        oDomain.kpis.forEach(function (sMeasure) {
            var fSum = aRows.reduce(function (fAcc, oRow) { return fAcc + (Number(oRow[sMeasure]) || 0); }, 0);
            var bAvg = (Scenarios.measures[sMeasure] || {}).avg;
            oTotals[sMeasure] = bAvg && aRows.length > 1 ? fSum / aRows.length : fSum;
        });
        return { values: oTotals, currency: (aRows[0] && aRows[0][CURRENCY]) || "" };
    }

    /** Opções do filtro "list": ordenadas, com texto e chave. */
    function shapeFilterValues(oFilterDef, aRawRows, fnText) {
        var aItems = (aRawRows || []).map(function (oRow) {
            return {
                key: String(oRow[oFilterDef.field]),
                text: dimensionText(oFilterDef.field, oRow, fnText)
            };
        });
        var bMonth = (Scenarios.dimensions[oFilterDef.field] || {}).kind === "month";
        return aItems.sort(function (a, b) {
            // meses em ordem cronológica (AAAAMM); demais, pelo texto
            return bMonth ? compare(a.key, b.key) : compare(a.text, b.text);
        });
    }

    return {
        buildFilters: buildFilters,
        buildScenarioQuery: buildScenarioQuery,
        buildKpiQuery: buildKpiQuery,
        buildFilterValuesQuery: buildFilterValuesQuery,
        formatMonth: formatMonth,
        dimensionText: dimensionText,
        shapeRows: shapeRows,
        shapeKpis: shapeKpis,
        shapeFilterValues: shapeFilterValues
    };
});
