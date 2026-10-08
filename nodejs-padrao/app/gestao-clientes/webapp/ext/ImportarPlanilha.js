/**
 * Ação "Importar planilha" do List Report: abre um diálogo para escolher um
 * arquivo .xlsx ou .csv, envia o conteúdo (base64) para a action não
 * vinculada importarPlanilha do serviço e atualiza a lista.
 */
sap.ui.define([
    "sap/m/Button",
    "sap/m/Dialog",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/Text",
    "sap/m/VBox",
    "sap/ui/unified/FileUploader"
], function (Button, Dialog, MessageBox, MessageToast, Text, VBox, FileUploader) {
    "use strict";

    function lerComoBase64(arquivo) {
        return new Promise(function (resolve, reject) {
            const leitor = new FileReader();
            leitor.onload = function () {
                resolve(String(leitor.result).split(",")[1] || "");
            };
            leitor.onerror = function () {
                reject(leitor.error);
            };
            leitor.readAsDataURL(arquivo);
        });
    }

    function textoDoErro(erro) {
        const detalhes = (erro && erro.error && erro.error.details) || [];
        const linhas = detalhes.map(function (d) {
            return d.message;
        });
        return [erro.message].concat(linhas).join("\n");
    }

    return {
        abrir: function () {
            const api = this;
            const modelo = api.getModel();
            const textos = api.getModel("i18n").getResourceBundle();
            let arquivo = null;

            const seletor = new FileUploader({
                width: "100%",
                fileType: ["xlsx", "csv"],
                placeholder: textos.getText("importarSelecione"),
                change: function (evento) {
                    const arquivos = evento.getParameter("files");
                    arquivo = arquivos && arquivos.length ? arquivos[0] : null;
                }
            });

            const dialogo = new Dialog({
                title: textos.getText("importarTitulo"),
                contentWidth: "32rem",
                content: [
                    new VBox({
                        items: [new Text({ text: textos.getText("importarInstrucoes") }), seletor]
                    }).addStyleClass("sapUiSmallMargin")
                ],
                beginButton: new Button({
                    text: textos.getText("importarConfirmar"),
                    type: "Emphasized",
                    press: async function () {
                        if (!arquivo) {
                            MessageToast.show(textos.getText("importarSemArquivo"));
                            return;
                        }
                        dialogo.setBusy(true);
                        try {
                            const operacao = modelo.bindContext("/importarPlanilha(...)");
                            operacao.setParameter("arquivo", await lerComoBase64(arquivo));
                            operacao.setParameter("nomeArquivo", arquivo.name);
                            await operacao.invoke();
                            const resultado = operacao.getBoundContext().getObject();
                            MessageToast.show(resultado.mensagem);
                            dialogo.close();
                            api.refresh();
                        } catch (erro) {
                            MessageBox.error(textoDoErro(erro), { title: textos.getText("importarErro") });
                        } finally {
                            dialogo.setBusy(false);
                        }
                    }
                }),
                endButton: new Button({
                    text: textos.getText("importarCancelar"),
                    press: function () {
                        dialogo.close();
                    }
                }),
                afterClose: function () {
                    dialogo.destroy();
                }
            });
            dialogo.open();
        }
    };
});
