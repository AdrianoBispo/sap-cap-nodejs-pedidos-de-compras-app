/**
 * Camada analítica: agregações $apply sobre os quatro domínios.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { iniciarServidor, falha, COMUM } from './apoio/contexto.js'

const api = iniciarServidor()
const A = '/odata/v4/analitico'

describe('Análises', () => {
  it('pedidos: valor, quantidade e ticket médio por status (custom aggregates)', async () => {
    const { data } = await api.get(`${A}/PedidosAnalise?$apply=groupby((statusPedido,currency),aggregate(valorTotal,qtdePedidos,valorMedio))`, COMUM)
    const total = data.value.reduce((s, l) => s + l.qtdePedidos, 0)
    const { data: todos } = await api.get(`/odata/v4/pedidos/Pedidos/$count?$filter=IsActiveEntity eq true`, COMUM)
    assert.equal(total, Number(todos))
    for (const linha of data.value) {
      assert.ok(Math.abs(linha.valorMedio - linha.valorTotal / linha.qtdePedidos) < 0.01)
    }
  })

  it('clientes por faixa de score e itens por categoria', async () => {
    const { data: faixas } = await api.get(`${A}/ClientesAnalise?$apply=groupby((faixaScore),aggregate(qtdeClientes))`, COMUM)
    assert.deepEqual(faixas.value.map(f => f.faixaScore).sort(), ['ALTO', 'BAIXO', 'MEDIO'])
    const { data: categorias } = await api.get(`${A}/ItensAnalise?$apply=groupby((categoria),aggregate(qtdeItens,valorEstoque))`, COMUM)
    assert.equal(categorias.value.reduce((s, c) => s + c.qtdeItens, 0) >= 100, true)
  })

  it('reembolsos por mês (AAAAMM) e serviço somente leitura', async () => {
    const { data } = await api.get(`${A}/ReembolsosAnalise?$apply=groupby((mesSolicitacao),aggregate(qtdeReembolsos))`, COMUM)
    assert.ok(data.value.every(l => /^\d{6}$/.test(l.mesSolicitacao)))
    assert.ok((await falha(api.post(`${A}/ReembolsosAnalise`, {}))).status >= 400)
  })
})
