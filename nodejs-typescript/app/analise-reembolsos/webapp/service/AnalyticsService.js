/*
 * Acesso ao serviço analítico AnaliticoService (CAP) (OData V4). Cada consulta é um
 * ODataListBinding com $$aggregation (gera $apply=filter()/groupby()/aggregate()) lido uma vez
 * com requestContexts e descartado em seguida.
 */
sap.ui.define([
    "sap/ui/base/Object",
    "sap/ui/model/Filter",
    "../model/AnalyticsQuery"
], function (BaseObject, Filter, AnalyticsQuery) {
    "use strict";

    var MAX_ROWS = 1000;

    function toFilter(oCondition) {
        var aFilters = oCondition.values.map(function (vValue) {
            return new Filter(oCondition.path, oCondition.operator, vValue);
        });
        return aFilters.length === 1 ? aFilters[0] : new Filter({ filters: aFilters, and: false });
    }

    return BaseObject.extend("analisereembolsos.service.AnalyticsService", {
        /**
         * @param {sap.ui.model.odata.v4.ODataModel} oModel modelo do serviço analítico
         * @param {function(string):string} fnText resolve textos do i18n
         */
        constructor: function (oModel, fnText) {
            BaseObject.call(this);
            this._model = oModel;
            this._text = fnText;
            this._filterValues = {};
        },

        _read: function (oQuery) {
            var aFilters = oQuery.filters.map(toFilter);
            var oBinding = this._model.bindList("/" + oQuery.entitySet, null, [], aFilters, {
                $$aggregation: oQuery.aggregation
            });
            return oBinding.requestContexts(0, MAX_ROWS).then(function (aContexts) {
                return aContexts.map(function (oContext) { return oContext.getObject(); });
            }).finally(function () {
                oBinding.destroy();
            });
        },

        /** Linhas de um cenário (dimensão x medidas), já ordenadas e limitadas. */
        loadScenario: function (oScenario, mFilterValues) {
            var oQuery = AnalyticsQuery.buildScenarioQuery(oScenario, mFilterValues);
            return this._read(oQuery).then(function (aRows) {
                return AnalyticsQuery.shapeRows(oScenario, aRows, this._text);
            }.bind(this));
        },

        /** Totais do domínio para os tiles de KPI. */
        loadKpis: function (oDomain, mFilterValues) {
            return this._read(AnalyticsQuery.buildKpiQuery(oDomain, mFilterValues)).then(function (aRows) {
                return AnalyticsQuery.shapeKpis(oDomain, aRows);
            });
        },

        /** Opções de um filtro "list" (valores distintos, com cache por campo). */
        loadFilterValues: function (oDomain, oFilterDef) {
            var sKey = oDomain.key + "/" + oFilterDef.field;
            if (!this._filterValues[sKey]) {
                this._filterValues[sKey] = this._read(AnalyticsQuery.buildFilterValuesQuery(oDomain, oFilterDef))
                    .then(function (aRows) {
                        return AnalyticsQuery.shapeFilterValues(oFilterDef, aRows, this._text);
                    }.bind(this))
                    .catch(function (oError) {
                        delete this._filterValues[sKey];
                        throw oError;
                    }.bind(this));
            }
            return this._filterValues[sKey];
        },

        /** Descarta as opções em cache (após "Atualizar"). */
        resetCache: function () {
            this._filterValues = {};
        }
    });
});
