# Gestão de Clientes

App **SAP Fiori Elements** (OData V4, List Report + Object Page) para cadastrar clientes e seus
endereços, com o endereço preenchido pelo CEP.

| | |
| --- | --- |
| Serviço | `ClientesService` (`/odata/v4/clientes`), entidade `Clientes` |
| `sap.app.id` | `gestaoclientes` |
| Tile (inbound) | `Cliente-manage` |
| URL local | `http://localhost:4004/gestaoclientes/index.html` |
| Perfis | `Admin` mantém; `Comum` só consulta |

## Páginas

- **Lista de clientes**: filtros por nome, CPF, e-mail, cliente ativo, cidade e UF do endereço
  principal; ação **Importar planilha** (`webapp/ext/ImportarPlanilha.js`).
- **Cliente**: seções *Dados do cliente*, *Endereços* e *Dados administrativos*; o cabeçalho mostra o
  **score** em %, numa barra vermelha (até 40), amarela (até 70) ou verde. O score é sorteado na
  criação e é somente leitura.
- **Endereço** (sub-página): o **CEP** tem value help dos CEPs já cadastrados; ao informá-lo, o
  backend consulta o ViaCEP e o side effect `Common.SideEffects#Cep` recarrega logradouro, bairro,
  cidade e UF. Para CEP geral de município, logradouro e bairro ficam editáveis e obrigatórios. A
  ação **Definir como principal** desmarca os demais endereços.

Regras que a tela reflete: CPF válido e único, CEP único por cliente, primeiro endereço vira
principal e cliente com pedido não pode ser excluído. Para o perfil `Comum`, o singleton
`Permissoes` esconde *Criar*, *Editar*, *Excluir*, *Importar planilha* e *Definir como principal*.

| Lista | Endereço pelo CEP |
| :---: | :---: |
| <img src="../../../assets/clientes/clientes.png" alt="Lista de clientes" width="440"> | <img src="../../../assets/clientes/fluxo-cliente-02-endereco-cep.png" alt="Endereço preenchido pelo CEP" width="440"> |

## Executar

Na raiz da implementação: `npm run watch` e abra a URL local acima, ou o tile no
`http://localhost:4004/launchpad.html`.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `annotations.cds` | Colunas, filtros, seções, score, ação *Definir como principal*, side effect do CEP, value help |
| `webapp/manifest.json` | Rotas Cliente → Endereço, tabela de endereços, ação *Importar planilha*, tile |
| `webapp/ext/ImportarPlanilha.js` | Diálogo de upload que chama a action `importarPlanilha` |
| `webapp/test/integration/` | Testes OPA5 gerados pelo Fiori tools |

Visão geral das apps: [`../README.md`](../README.md).

<details>
<summary>Dados da geração (SAP Fiori tools)</summary>

|               |
| ------------- |
|**Generation Date and Time**<br>Thu Oct 08 2026 08:52:59 GMT-0300 (Horário Padrão de Brasília)|
|**App Generator**<br>SAP Fiori Application Generator|
|**App Generator Version**<br>1.28.0|
|**Generation Platform**<br>CLI|
|**Template Used**<br>List Report Page V4|
|**Service Type**<br>Local CAP|
|**Service URL**<br>http://localhost:4004/odata/v4/clientes/|
|**Module Name**<br>gestao-clientes|
|**Application Title**<br>Gestão de Clientes|
|**Namespace**<br>|
|**UI5 Theme**<br>sap_horizon|
|**UI5 Version**<br>1.148.12|
|**Enable TypeScript**<br>False|
|**Add Eslint configuration**<br>True, see https://www.npmjs.com/package/@sap-ux/eslint-plugin-fiori-tools#rules for the eslint rules.|
|**Main Entity**<br>Clientes|

</details>
