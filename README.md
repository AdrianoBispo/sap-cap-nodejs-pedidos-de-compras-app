# Pedidos de Compras — SAP CAP (Node.js)

Versão SAP Cloud Application Programming Model (CAP) da aplicação de Pedidos de Compras
desenvolvida originalmente em SAP RAP (pacote `ZAVBS_PC`): clientes e endereços (ViaCEP), estoque,
pedidos com reserva de estoque e pagamento simulado, reembolsos, importação por planilha e análises,
com cinco aplicações SAPUI5 (quatro Fiori Elements e uma freestyle) e um launchpad local.

| Pasta | Conteúdo |
| --- | --- |
| [`nodejs-padrao/`](nodejs-padrao) | Implementação em JavaScript (ESM) |
| [`nodejs-typescript/`](nodejs-typescript) | Implementação em TypeScript (`strict`, tipos gerados pelo cds-typer) |
| [`docs/`](docs) | [Especificação técnica](docs/especificacao-tecnica.md) (Markdown e DOCX) e modelos de importação |

As duas implementações são equivalentes: mesmo modelo CDS, mesmos serviços OData V4, mesmas apps,
mesmos dados de demonstração e a mesma suíte de 63 testes. Em qualquer uma delas:

```sh
npm install
npm run watch        # http://localhost:4004/launchpad.html  (usuários admin/admin e comum/comum)
npm test
```
