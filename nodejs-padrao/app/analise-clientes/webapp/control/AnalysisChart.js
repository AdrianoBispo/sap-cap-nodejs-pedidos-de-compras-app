/*
 * Gráfico de uma análise: VizFrame (sap.viz) configurado a partir de uma dimensão, uma ou mais
 * medidas e linhas já moldadas pelo AnalyticsQuery. Usado nos cards do painel e na página de
 * detalhe, que só trocam `chartType` e `rows`.
 */
sap.ui.define([
    "sap/ui/core/Control",
    "sap/ui/model/json/JSONModel",
    "sap/viz/ui5/controls/VizFrame",
    "sap/viz/ui5/controls/common/feeds/FeedItem",
    "sap/viz/ui5/data/FlattenedDataset",
    "sap/viz/ui5/api/env/Format",
    "sap/viz/ui5/format/ChartFormatter"
], function (Control, JSONModel, VizFrame, FeedItem, FlattenedDataset, Format, ChartFormatter) {
    "use strict";

    // habilita as máscaras de formatação do ChartFormatter nos eixos e rótulos
    Format.numericFormatter(ChartFormatter.getInstance());
    var PATTERN = ChartFormatter.DefaultPattern;

    var VIZ_TYPE = { column: "column", bar: "bar", line: "line", donut: "donut" };

    function formatPattern(sKind) {
        return sKind === "int" ? PATTERN.STANDARDINTEGER : PATTERN.SHORTFLOAT_MFD2;
    }

    return Control.extend("analiseclientes.control.AnalysisChart", {
        metadata: {
            properties: {
                /** column | bar | line | donut */
                chartType: { type: "string", defaultValue: "column" },
                /** Rótulo do eixo de categorias / da legenda. */
                dimensionLabel: { type: "string", defaultValue: "" },
                /** [{name, label, kind}] — kind: int | dec | money */
                measures: { type: "object[]", defaultValue: [] },
                /** [{label, values: {Medida: número}}] */
                rows: { type: "object[]", defaultValue: [] },
                height: { type: "sap.ui.core.CSSSize", defaultValue: "18rem" },
                noDataText: { type: "string", defaultValue: "" }
            },
            aggregations: {
                _viz: { type: "sap.viz.ui5.controls.VizFrame", multiple: false, visibility: "hidden" }
            }
        },

        renderer: {
            apiVersion: 2,
            render: function (oRm, oControl) {
                var bEmpty = !oControl.getRows().length;
                oRm.openStart("div", oControl).class("pcAnalysisChart").style("height", oControl.getHeight()).openEnd();
                if (bEmpty) {
                    oRm.openStart("div").class("pcAnalysisChartEmpty").openEnd()
                        .text(oControl.getNoDataText()).close("div");
                } else {
                    oRm.renderControl(oControl.getAggregation("_viz"));
                }
                oRm.close("div");
            }
        },

        onBeforeRendering: function () {
            if (this.getRows().length) {
                this._configure();
            }
        },

        _getViz: function () {
            var oViz = this.getAggregation("_viz");
            if (!oViz) {
                oViz = new VizFrame({
                    width: "100%",
                    height: "100%",
                    uiConfig: { applicationSet: "fiori" }
                });
                this.setAggregation("_viz", oViz, true);
            }
            return oViz;
        },

        _configure: function () {
            var oViz = this._getViz();
            var aMeasures = this.getMeasures();
            var sType = VIZ_TYPE[this.getChartType()] || "column";
            var bPie = sType === "donut";
            // Rosca só mostra uma medida
            var aUsed = bPie ? aMeasures.slice(0, 1) : aMeasures;
            var sDimension = this.getDimensionLabel() || "-";

            var aData = this.getRows().map(function (oRow) {
                var oItem = { label: oRow.label };
                aUsed.forEach(function (oMeasure) { oItem[oMeasure.name] = oRow.values[oMeasure.name]; });
                return oItem;
            });

            var oModel = new JSONModel({ rows: aData });
            oViz.setModel(oModel);
            oViz.setDataset(new FlattenedDataset({
                dimensions: [{ name: sDimension, value: "{label}" }],
                measures: aUsed.map(function (oMeasure) {
                    return { name: oMeasure.label, value: "{" + oMeasure.name + "}" };
                }),
                data: { path: "/rows" }
            }));

            oViz.setVizType(sType);
            oViz.destroyFeeds();
            var aMeasureNames = aUsed.map(function (oMeasure) { return oMeasure.label; });
            if (bPie) {
                oViz.addFeed(new FeedItem({ uid: "size", type: "Measure", values: aMeasureNames }));
                oViz.addFeed(new FeedItem({ uid: "color", type: "Dimension", values: [sDimension] }));
            } else {
                oViz.addFeed(new FeedItem({ uid: "valueAxis", type: "Measure", values: aMeasureNames }));
                oViz.addFeed(new FeedItem({ uid: "categoryAxis", type: "Dimension", values: [sDimension] }));
            }

            var sPattern = formatPattern(aUsed[0] && aUsed[0].kind);
            var oProps = {
                title: { visible: false },
                legend: { visible: bPie || aUsed.length > 1 },
                plotArea: { dataLabel: { visible: true, formatString: sPattern, type: bPie ? "value" : undefined } },
                interaction: { selectability: { mode: "none" } }
            };
            if (!bPie) {
                oProps.valueAxis = { title: { visible: false }, label: { formatString: sPattern } };
                oProps.categoryAxis = { title: { visible: false } };
            }
            oViz.setVizProperties(oProps);
        }
    });
});
