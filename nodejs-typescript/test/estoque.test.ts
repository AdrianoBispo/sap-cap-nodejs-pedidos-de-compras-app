/**
 * Gestão de Estoque: SKU, disponibilidade e status calculados, inativação e
 * exclusão controladas.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { iniciarServidor, falha, COMUM } from './apoio/contexto.js'

const api = iniciarServidor()
const E = '/odata/v4/estoque'
const P = '/odata/v4/pedidos'

async function novoItem(dados = {}) {
  const { data } = await api.post(`${E}/Itens`, {})
  await api.patch(`${E}/Itens${api.chave(data.ID, false)}`, {
    nome: `Item de teste ${Math.random().toString(36).slice(2, 8)}`, categoria_code: 'ELETRONICOS',
    precoUnitario: 10.5, qtdeEstoque: 20, ...dados
  })
  return api.ativar(E, 'Itens', data.ID)
}

describe('Gestão de Estoque', () => {
  it('gera SKU no Save com as 3 primeiras letras da categoria', async () => {
    const item = await novoItem()
    assert.match(item.sku, /^SKU-ELE-\d{10}$/)
    assert.equal(item.itemAtivo, true)
    assert.equal(item.currency_code, 'BRL')
    const outro = await novoItem()
    assert.notEqual(outro.sku, item.sku)
  })

  it('regenera o SKU quando a categoria muda e mantém quando não muda', async () => {
    const item = await novoItem()
    await api.editar(E, 'Itens', item.ID)
    await api.patch(`${E}/Itens${api.chave(item.ID, false)}`, { descricao: 'Nova descrição' })
    const mesmo = await api.ativar(E, 'Itens', item.ID)
    assert.equal(mesmo.sku, item.sku)

    await api.editar(E, 'Itens', item.ID)
    await api.patch(`${E}/Itens${api.chave(item.ID, false)}`, { categoria_code: 'INFORMATICA' })
    const novo = await api.ativar(E, 'Itens', item.ID)
    assert.match(novo.sku, /^SKU-INF-\d{10}$/)
  })

  it('disponível = estoque - reservada e status SEM_ESTOQUE / ACABANDO / EM_ESTOQUE', async () => {
    assert.equal((await novoItem({ qtdeEstoque: 0 })).statusEstoque_code, 'SEM_ESTOQUE')
    const acabando = await novoItem({ qtdeEstoque: 10 })
    assert.equal(acabando.statusEstoque_code, 'ACABANDO')
    assert.equal(acabando.qtdeDisponivel, 10)
    assert.equal((await novoItem({ qtdeEstoque: 11 })).statusEstoque_code, 'EM_ESTOQUE')
  })

  it('preço negativo e estoque menor que a reserva são rejeitados', async () => {
    const { data } = await api.post(`${E}/Itens`, {})
    await api.patch(`${E}/Itens${api.chave(data.ID, false)}`, { nome: 'Inválido', categoria_code: 'CASA', precoUnitario: -1, qtdeEstoque: 1 })
    assert.match(JSON.stringify(await falha(api.ativar(E, 'Itens', data.ID))), /Preço unitário deve ser maior ou igual a zero/)

    const { data: reservado } = await api.get(`${E}/Itens?$filter=qtdeReservada gt 0 and IsActiveEntity eq true&$top=1`)
    const item = reservado.value[0]
    await api.editar(E, 'Itens', item.ID)
    await api.patch(`${E}/Itens${api.chave(item.ID, false)}`, { qtdeEstoque: item.qtdeReservada - 1 })
    assert.match(JSON.stringify(await falha(api.ativar(E, 'Itens', item.ID))), /menor que a reservada/)
  })

  it('salvar a edição do item não sobrescreve reservas feitas no meio tempo', async () => {
    const item = await novoItem({ qtdeEstoque: 50 })
    await api.editar(E, 'Itens', item.ID)
    await api.patch(`${E}/Itens${api.chave(item.ID, false)}`, { qtdeEstoque: 60, qtdeReservada: 0 })

    // enquanto o item está em edição, um pedido reserva 5 unidades
    const { data: cliente } = await api.get(`${P}/ClientesAtivos?$top=1`)
    const { data: pedido } = await api.post(`${P}/Pedidos`, {})
    await api.patch(`${P}/Pedidos${api.chave(pedido.ID, false)}`, { cliente_ID: cliente.value[0].ID })
    const { data: linha } = await api.post(`${P}/Pedidos${api.chave(pedido.ID, false)}/itens`, {})
    await api.patch(`${P}/ItensPedido${api.chave(linha.ID, false)}`, { item_ID: item.ID, qtdeItemPedido: 5 })
    await api.ativar(P, 'Pedidos', pedido.ID)

    const salvo = await api.ativar(E, 'Itens', item.ID)
    assert.equal(salvo.qtdeEstoque, 60)
    assert.equal(salvo.qtdeReservada, 5)
    assert.equal(salvo.qtdeDisponivel, 55)
  })

  it('inativação bloqueada com estoque disponível; permitida sem estoque e sem pedido', async () => {
    const comEstoque = await novoItem({ qtdeEstoque: 5 })
    await api.editar(E, 'Itens', comEstoque.ID)
    await api.patch(`${E}/Itens${api.chave(comEstoque.ID, false)}`, { itemAtivo: false })
    assert.match((await falha(api.ativar(E, 'Itens', comEstoque.ID))).message, /Inativação bloqueada/)

    const semEstoque = await novoItem({ qtdeEstoque: 0 })
    await api.editar(E, 'Itens', semEstoque.ID)
    await api.patch(`${E}/Itens${api.chave(semEstoque.ID, false)}`, { itemAtivo: false })
    assert.equal((await api.ativar(E, 'Itens', semEstoque.ID)).itemAtivo, false)
  })

  it('exclusão bloqueada para item vinculado a pedido; item livre é excluído', async () => {
    const { data } = await api.get(`${P}/Pedidos?$filter=IsActiveEntity eq true&$top=1&$expand=itens($select=item_ID)`)
    const erro = await falha(api.del(`${E}/Itens${api.chave(data.value[0].itens[0].item_ID)}`))
    assert.match(erro.message, /vinculado a pedido ou reserva/)

    const livre = await novoItem()
    await api.del(`${E}/Itens${api.chave(livre.ID)}`)
  })

  it('usuário comum consulta, mas não mantém itens', async () => {
    const { data } = await api.get(`${E}/Itens?$top=1`, COMUM)
    assert.equal(data.value.length, 1)
    assert.equal((await falha(api.post(`${E}/Itens`, {}, COMUM))).status, 403)
  })

  it('a UI só oferece alteração ao Admin: Permissoes.somenteLeitura por usuário', async () => {
    const { data: admin } = await api.get(`${E}/Permissoes`)
    assert.equal(admin.somenteLeitura, false)
    const { data: comum } = await api.get(`${E}/Permissoes`, COMUM)
    assert.equal(comum.somenteLeitura, true)
  })
})
