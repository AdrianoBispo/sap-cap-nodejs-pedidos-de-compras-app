/*
 * Barra de filtros de um domínio, montada a partir de Scenarios.domains[].filters. Os valores
 * ficam no modelo "state" (/filters/<domínio>/<campo>) para sobreviver à navegação
 * painel <-> detalhe.
 */
sap.ui.define([
    "sap/ui/core/Item",
    "sap/m/Button",
    "sap/m/Input",
    "sap/m/Label",
    "sap/m/MultiComboBox",
    "sap/m/Select",
    "sap/m/VBox",
    "../model/Scenarios"
], function (Item, Button, Input, Label, MultiComboBox, Select, VBox, Scenarios) {
    "use strict";

    var FilterBar = {};

    /**
     * (Re)monta os filtros do domínio no container.
     * @param {sap.m.FlexBox} oBox container
     * @param {object} oDomain domínio de Scenarios
     * @param {object} oContext state (JSONModel), service (AnalyticsService), getText, onChange e onLoadError
     */
    FilterBar.build = function (oBox, oDomain, oContext) {
        var oState = oContext.state;
        var getText = oContext.getText;

        function setValue(sField, vValue) {
            oState.setProperty("/filters/" + oDomain.key + "/" + sField, vValue);
            oContext.onChange();
        }

        function createControl(oFilter, sLabel, vCurrent) {
            if (oFilter.type === "list") {
                var oCombo = new MultiComboBox({
                    width: "100%",
                    placeholder: getText("filterAll"),
                    selectionFinish: function (oEvent) {
                        setValue(oFilter.field, oEvent.getSource().getSelectedKeys());
                    }
                });
                oContext.service.loadFilterValues(oDomain, oFilter).then(function (aItems) {
                    aItems.forEach(function (oItem) {
                        oCombo.addItem(new Item({ key: oItem.key, text: oItem.text }));
                    });
                    oCombo.setSelectedKeys(vCurrent || []);
                }).catch(function () {
                    oContext.onLoadError(sLabel);
                });
                return oCombo;
            }
            if (oFilter.type === "boolean") {
                return new Select({
                    width: "100%",
                    selectedKey: vCurrent || "",
                    items: [
                        new Item({ key: "", text: getText("filterAll") }),
                        new Item({ key: "true", text: getText("yes") }),
                        new Item({ key: "false", text: getText("no") })
                    ],
                    change: function (oEvent) {
                        setValue(oFilter.field, oEvent.getParameter("selectedItem").getKey());
                    }
                });
            }
            return new Input({
                width: "100%",
                value: vCurrent || "",
                placeholder: getText("filterSearchPlaceholder"),
                change: function (oEvent) {
                    setValue(oFilter.field, oEvent.getParameter("value"));
                }
            });
        }

        oBox.destroyItems();
        oDomain.filters.forEach(function (oFilter) {
            var sLabel = getText(Scenarios.dimensions[oFilter.field].labelKey);
            var vCurrent = oState.getProperty("/filters/" + oDomain.key + "/" + oFilter.field);
            var oControl = createControl(oFilter, sLabel, vCurrent);
            oBox.addItem(new VBox({ items: [new Label({ text: sLabel, labelFor: oControl }), oControl] })
                .addStyleClass("pcFilterItem"));
        });

        oBox.addItem(new Button({
            text: getText("clearFilters"),
            type: "Transparent",
            press: function () {
                oState.setProperty("/filters/" + oDomain.key, {});
                FilterBar.build(oBox, oDomain, oContext);
                oContext.onChange();
            }
        }));
    };

    return FilterBar;
});
