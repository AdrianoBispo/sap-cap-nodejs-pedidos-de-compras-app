/**
 * Ciclo de vida do pedido (equivalente às classes ltcl_registro_pedido,
 * ltcl_edicao_pedido e ltcl_ciclo_pedido do RAP).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { iniciarServidor, falha, COMUM, type Opcoes } from './apoio/contexto.js'

const api = iniciarServidor()
const P = '/odata/v4/pedidos'
const E = '/odata/v4/estoque'

const CARTAO_OK = { metodoPagamento: 'CARTAO_CREDITO', numeroCartao: '4111111111111111', validade: '12/35', cvv: '123' }
const CARTAO_RECUSADO = { ...CARTAO_OK, cvv: '000' }

async function clienteAtivo(pular = 0) {
  const { data } = await api.get(`${P}/ClientesAtivos?$orderby=cpf&$skip=${pular}&$top=1`)
  return data.value[0]
}

async function itemComEstoque(minimo = 30, pular = 0) {
  const { data } = await api.get(`${P}/ItensAtivos?$filter=qtdeDisponivel ge ${minimo}&$orderby=sku&$skip=${pular}&$top=1`)
  return data.value[0]
}

async function saldo(itemID: string) {
  const { data } = await api.get(`${E}/Itens${api.chave(itemID)}?$select=qtdeEstoque,qtdeReservada,qtdeDisponivel,statusEstoque_code`)
  return data
}

/** Linha do rascunho: ID do item e quantidade. */
interface LinhaRascunho {
  item: string
  qtde: number
}

/** Cria o rascunho com cliente e linhas [{ item, qtde }] e devolve o ID. */
async function rascunho(clienteID: string | null, linhas: LinhaRascunho[], opcoes?: Opcoes): Promise<string> {
  const { data: pedido } = await api.post(`${P}/Pedidos`, {}, opcoes)
  if (clienteID) await api.patch(`${P}/Pedidos${api.chave(pedido.ID, false)}`, { cliente_ID: clienteID }, opcoes)
  for (const { item, qtde } of linhas) {
    const { data: linha } = await api.post(`${P}/Pedidos${api.chave(pedido.ID, false)}/itens`, {}, opcoes)
    await api.patch(`${P}/ItensPedido${api.chave(linha.ID, false)}`, { item_ID: item, qtdeItemPedido: qtde }, opcoes)
  }
  return pedido.ID
}

async function pedidoRegistrado(linhas: LinhaRascunho[], cliente?: { ID: string }) {
  const ID = await rascunho((cliente ?? await clienteAtivo()).ID, linhas)
  return api.ativar(P, 'Pedidos', ID)
}

const acao = (ID: string, nome: string, dados: object = {}) => api.post(`${P}/Pedidos${api.chave(ID)}/PedidosService.${nome}`, dados)

describe('Pedidos de Compras', () => {
  describe('registro (Save do rascunho)', () => {
    it('rascunho não reserva estoque e calcula o total provisório', async () => {
      const item = await itemComEstoque()
      const antes = await saldo(item.ID)
      const ID = await rascunho((await clienteAtivo()).ID, [{ item: item.ID, qtde: 2 }])
      const { data } = await api.get(`${P}/Pedidos${api.chave(ID, false)}`)
      assert.equal(data.statusPedido_code, 'ABERTO')
      assert.equal(Number(data.valorTotal), Math.round(2 * item.precoUnitario * 100) / 100)
      assert.ok(data.endereco_ID, 'endereço principal do cliente preenchido')
      assert.equal((await saldo(item.ID)).qtdeReservada, antes.qtdeReservada)
    })

    it('Salvar registra o pedido ABERTO, gera o número e reserva o estoque', async () => {
      const item = await itemComEstoque()
      const antes = await saldo(item.ID)
      const pedido = await pedidoRegistrado([{ item: item.ID, qtde: 3 }])
      assert.match(pedido.numeroPedido, /^\d{10}$/)
      assert.equal(pedido.statusPedido_code, 'ABERTO')
      assert.equal(pedido.statusPagamento_code, 'PENDENTE')
      const depois = await saldo(item.ID)
      assert.equal(depois.qtdeReservada, antes.qtdeReservada + 3)
      assert.equal(depois.qtdeDisponivel, antes.qtdeDisponivel - 3)
    })

    it('estoque insuficiente bloqueia o Save e nada é reservado', async () => {
      const item = await itemComEstoque(1)
      const antes = await saldo(item.ID)
      const ID = await rascunho((await clienteAtivo()).ID, [{ item: item.ID, qtde: antes.qtdeDisponivel + 1 }])
      const erro = await falha(api.ativar(P, 'Pedidos', ID))
      assert.equal(erro.status, 409)
      assert.match(erro.message, /Estoque insuficiente/)
      assert.equal((await saldo(item.ID)).qtdeReservada, antes.qtdeReservada)
    })

    it('pedido sem itens não é registrado', async () => {
      const ID = await rascunho((await clienteAtivo()).ID, [])
      const erro = await falha(api.ativar(P, 'Pedidos', ID))
      assert.match(erro.message, /ao menos um item/)
    })

    it('item sem estoque disponível é barrado ao ser incluído no rascunho', async () => {
      const { data } = await api.get(`${P}/ItensAtivos?$filter=qtdeDisponivel eq 0&$top=1`)
      const { data: pedido } = await api.post(`${P}/Pedidos`, {})
      const { data: linha } = await api.post(`${P}/Pedidos${api.chave(pedido.ID, false)}/itens`, {})
      const erro = await falha(api.patch(`${P}/ItensPedido${api.chave(linha.ID, false)}`, { item_ID: data.value[0].ID }))
      assert.match(erro.message, /sem estoque disponível/)
    })

    it('o usuário comum também registra pedidos', async () => {
      const item = await itemComEstoque()
      const ID = await rascunho((await clienteAtivo(1)).ID, [{ item: item.ID, qtde: 1 }], COMUM)
      const pedido = await api.ativar(P, 'Pedidos', ID, COMUM)
      assert.equal(pedido.statusPedido_code, 'ABERTO')
    })
  })

  describe('edição dos itens do pedido ABERTO', () => {
    it('aumentar, diminuir, incluir e remover itens ajusta a reserva pela diferença', async () => {
      const a = await itemComEstoque(30, 0)
      const b = await itemComEstoque(30, 1)
      const pedido = await pedidoRegistrado([{ item: a.ID, qtde: 2 }])
      const saldoA = await saldo(a.ID)
      const saldoB = await saldo(b.ID)

      // aumenta A para 5 e inclui B com 4
      await api.editar(P, 'Pedidos', pedido.ID)
      const { data: linhas } = await api.get(`${P}/Pedidos${api.chave(pedido.ID, false)}/itens`)
      await api.patch(`${P}/ItensPedido${api.chave(linhas.value[0].ID, false)}`, { qtdeItemPedido: 5 })
      const { data: novaLinha } = await api.post(`${P}/Pedidos${api.chave(pedido.ID, false)}/itens`, {})
      await api.patch(`${P}/ItensPedido${api.chave(novaLinha.ID, false)}`, { item_ID: b.ID, qtdeItemPedido: 4 })
      await api.ativar(P, 'Pedidos', pedido.ID)
      assert.equal((await saldo(a.ID)).qtdeReservada, saldoA.qtdeReservada + 3)
      assert.equal((await saldo(b.ID)).qtdeReservada, saldoB.qtdeReservada + 4)

      // remove A e diminui B para 1
      await api.editar(P, 'Pedidos', pedido.ID)
      const { data: linhas2 } = await api.get(`${P}/Pedidos${api.chave(pedido.ID, false)}/itens`)
      const linhaA = linhas2.value.find((l: { item_ID: string }) => l.item_ID === a.ID)
      const linhaB = linhas2.value.find((l: { item_ID: string }) => l.item_ID === b.ID)
      await api.del(`${P}/ItensPedido${api.chave(linhaA.ID, false)}`)
      await api.patch(`${P}/ItensPedido${api.chave(linhaB.ID, false)}`, { qtdeItemPedido: 1 })
      const atualizado = await api.ativar(P, 'Pedidos', pedido.ID)
      assert.equal((await saldo(a.ID)).qtdeReservada, saldoA.qtdeReservada - 2)
      assert.equal((await saldo(b.ID)).qtdeReservada, saldoB.qtdeReservada + 1)
      assert.equal(Number(atualizado.valorTotal), Number(b.precoUnitario))
    })

    it('nunca reserva acima do estoque: aumento sem saldo bloqueia o Save', async () => {
      const item = await itemComEstoque(1)
      const disponivel = (await saldo(item.ID)).qtdeDisponivel
      const pedido = await pedidoRegistrado([{ item: item.ID, qtde: 1 }])
      const reservadoAntes = (await saldo(item.ID)).qtdeReservada
      await api.editar(P, 'Pedidos', pedido.ID)
      const { data: linhas } = await api.get(`${P}/Pedidos${api.chave(pedido.ID, false)}/itens`)
      await api.patch(`${P}/ItensPedido${api.chave(linhas.value[0].ID, false)}`, { qtdeItemPedido: disponivel + 1 })
      const erro = await falha(api.ativar(P, 'Pedidos', pedido.ID))
      assert.match(erro.message, /Estoque insuficiente/)
      assert.equal((await saldo(item.ID)).qtdeReservada, reservadoAntes)
    })

    it('o cliente de um pedido registrado não pode ser trocado', async () => {
      const pedido = await pedidoRegistrado([{ item: (await itemComEstoque()).ID, qtde: 1 }])
      await api.editar(P, 'Pedidos', pedido.ID)
      const outro = await clienteAtivo(3)
      const erro = await falha(api.patch(`${P}/Pedidos${api.chave(pedido.ID, false)}`, { cliente_ID: outro.ID }))
      assert.match(erro.message, /cliente de um pedido registrado/)
    })

    it('só o pedido ABERTO pode ser editado e o pedido registrado não é excluído', async () => {
      const { data } = await api.get(`${P}/Pedidos?$filter=statusPedido_code eq 'FINALIZADO' and IsActiveEntity eq true&$top=1`)
      const erro = await falha(api.editar(P, 'Pedidos', data.value[0].ID))
      assert.match(erro.message, /só pode ser editado no status ABERTO/)
      const exclusao = await falha(api.del(`${P}/Pedidos${api.chave(data.value[0].ID)}`))
      assert.match(exclusao.message, /não pode ser excluído/)
    })
  })

  describe('pagamento, aprovação e cancelamento', () => {
    it('pagamento recusado mantém ABERTO; aprovado leva a AGUARDANDO_APROVACAO', async () => {
      const pedido = await pedidoRegistrado([{ item: (await itemComEstoque()).ID, qtde: 1 }])
      const { data: recusado } = await acao(pedido.ID, 'efetuarPagamento', CARTAO_RECUSADO)
      assert.equal(recusado.statusPedido_code, 'ABERTO')
      assert.equal(recusado.statusPagamento_code, 'RECUSADO')

      const { data: aprovado } = await acao(pedido.ID, 'efetuarPagamento', CARTAO_OK)
      assert.equal(aprovado.statusPedido_code, 'AGUARDANDO_APROVACAO')
      assert.equal(aprovado.statusPagamento_code, 'APROVADO')

      // somente a última tentativa segura é mantida; nada sensível é gravado
      const { data: pagamento } = await api.get(`${P}/Pedidos${api.chave(pedido.ID)}/pagamento`)
      assert.equal(pagamento.statusPagamento_code, 'APROVADO')
      assert.equal(pagamento.bandeiraCartao, 'VISA')
      assert.equal(pagamento.cartaoMascarado, '**** **** **** 1111')
      assert.equal(JSON.stringify(pagamento).includes('4111111111111111'), false)
    })

    it('dados de cartão inválidos são erro (não recusa)', async () => {
      const pedido = await pedidoRegistrado([{ item: (await itemComEstoque()).ID, qtde: 1 }])
      const erro = await falha(acao(pedido.ID, 'efetuarPagamento', { ...CARTAO_OK, validade: '01/20' }))
      assert.match(erro.message, /cartão expirado/)
    })

    it('aprovar exige pagamento aprovado; depois baixa o estoque, gera snapshots e finaliza', async () => {
      const item = await itemComEstoque()
      const pedido = await pedidoRegistrado([{ item: item.ID, qtde: 2 }])
      const pendente = await falha(acao(pedido.ID, 'aprovarPedido'))
      assert.match(pendente.message, /Pagamento pendente/)

      await acao(pedido.ID, 'efetuarPagamento', CARTAO_OK)
      const antes = await saldo(item.ID)
      const { data: finalizado } = await acao(pedido.ID, 'aprovarPedido')
      assert.equal(finalizado.statusPedido_code, 'FINALIZADO')
      assert.ok(finalizado.dataFinalizacao)
      assert.equal(finalizado.encerrado, true)
      const depois = await saldo(item.ID)
      assert.equal(depois.qtdeEstoque, antes.qtdeEstoque - 2)
      assert.equal(depois.qtdeReservada, antes.qtdeReservada - 2)

      const { data: snap } = await api.get(`${P}/Pedidos${api.chave(pedido.ID)}?$expand=clienteSnapshot,itensSnapshot`)
      assert.equal(snap.clienteSnapshot.motivoSnapshot, 'FINALIZACAO')
      assert.equal(snap.itensSnapshot.length, 1)
      assert.equal(snap.itensSnapshot[0].quantidade, 2)
    })

    it('cancelar sem pagamento aprovado libera a reserva, gera snapshots e exige motivo', async () => {
      const item = await itemComEstoque()
      const pedido = await pedidoRegistrado([{ item: item.ID, qtde: 2 }])
      const semMotivo = await falha(acao(pedido.ID, 'cancelarPedido', { motivoCancelamento: '  ' }))
      assert.ok(semMotivo.status >= 400)

      const antes = await saldo(item.ID)
      const { data: cancelado } = await acao(pedido.ID, 'cancelarPedido', { motivoCancelamento: 'Desistência' })
      assert.equal(cancelado.statusPedido_code, 'CANCELADO')
      assert.equal(cancelado.motivoCancelamento, 'Desistência')
      assert.equal(cancelado.canceladoPor, 'admin')
      assert.equal((await saldo(item.ID)).qtdeReservada, antes.qtdeReservada - 2)
      const { data: snap } = await api.get(`${P}/Pedidos${api.chave(pedido.ID)}/clienteSnapshot`)
      assert.equal(snap.motivoSnapshot, 'CANCELAMENTO')

      const outraVez = await falha(acao(pedido.ID, 'cancelarPedido', { motivoCancelamento: 'De novo' }))
      assert.match(outraVez.message, /cancelado não pode ser alterado/)
    })

    it('cancelar com pagamento aprovado abre reembolso e mantém a reserva', async () => {
      const item = await itemComEstoque()
      const pedido = await pedidoRegistrado([{ item: item.ID, qtde: 1 }])
      assert.equal(pedido.semReembolso, true, 'sem solicitação: link para a Gestão de Reembolsos oculto')
      await acao(pedido.ID, 'efetuarPagamento', CARTAO_OK)
      const antes = await saldo(item.ID)
      const { data } = await acao(pedido.ID, 'cancelarPedido', { motivoCancelamento: 'Produto com defeito' })
      assert.equal(data.statusPedido_code, 'PROCESSANDO_REEMBOLSO')
      assert.equal(data.semReembolso, false, 'com solicitação: o pedido mostra o link para o reembolso')
      assert.equal((await saldo(item.ID)).qtdeReservada, antes.qtdeReservada)
      const { data: reembolsos } = await api.get(`/odata/v4/reembolsos/Reembolsos?$filter=pedido_ID eq ${pedido.ID}`)
      assert.equal(reembolsos.value.length, 1)
      assert.equal(reembolsos.value[0].statusReembolso_code, 'PENDENTE')
      assert.equal(reembolsos.value[0].statusPedidoAnterior_code, 'AGUARDANDO_APROVACAO')
    })

    it('ações não são executadas sobre o rascunho nem durante a edição', async () => {
      const pedido = await pedidoRegistrado([{ item: (await itemComEstoque()).ID, qtde: 1 }])
      await api.editar(P, 'Pedidos', pedido.ID)
      const emEdicao = await falha(acao(pedido.ID, 'efetuarPagamento', CARTAO_OK))
      assert.match(emEdicao.message, /em edição/)
      const noRascunho = await falha(api.post(`${P}/Pedidos${api.chave(pedido.ID, false)}/PedidosService.efetuarPagamento`, CARTAO_OK))
      assert.ok(noRascunho.status >= 400)
    })
  })
  describe('campos somente leitura (só o cliente e os itens são informados)', () => {
    it('no $metadata, dados do cliente e do pagamento são calculados (não editáveis)', async () => {
      const { data: xml } = await api.get(`${P}/$metadata`)
      const anotacoes = (alvo: string): string => xml.match(new RegExp(`<Annotations Target="PedidosService\\.${alvo}">([\\s\\S]*?)</Annotations>`))?.[1] ?? ''
      for (const campo of ['nomeCliente', 'cpfClienteFormatado', 'emailCliente', 'telefoneCliente', 'generoCliente', 'dataNascimentoCliente']) {
        assert.match(anotacoes(`Pedidos/${campo}`), /Core\.Computed/, campo)
        assert.doesNotMatch(anotacoes(`Pedidos/${campo}`), /FieldControlType\/Mandatory/, campo)
      }
      for (const campo of ['metodoPagamento_code', 'statusPagamento_code', 'bandeiraCartao', 'cartaoMascarado', 'codigoAutorizacao', 'mensagemPagamento', 'dataPagamento']) {
        assert.match(anotacoes(`Pagamentos/${campo}`), /Core\.Computed/, campo)
      }
      assert.match(anotacoes('Pedidos/observacao'), /FieldControlType\/ReadOnly/)
    })

    it('ao informar o cliente, os dados dele chegam pela associação e não aceitam escrita', async () => {
      const cliente = await clienteAtivo()
      const ID = await rascunho(cliente.ID, [])
      await api.patch(`${P}/Pedidos${api.chave(ID, false)}`, { emailCliente: 'invasor@exemplo.com', nomeCliente: 'Outro' })
      const { data } = await api.get(`${P}/Pedidos${api.chave(ID, false)}?$expand=cliente`)
      assert.equal(data.cliente.email, cliente.email)
      assert.equal(data.cliente.nome, cliente.nome)
      assert.notEqual(data.emailCliente, 'invasor@exemplo.com')
      assert.notEqual(data.nomeCliente, 'Outro')
      assert.ok(data.enderecoPrincipalCompleto, 'endereço principal preenchido automaticamente')
    })

    it('o pagamento não aceita escrita pela tela e é preservado na edição dos itens', async () => {
      const pedido = await pedidoRegistrado([{ item: (await itemComEstoque()).ID, qtde: 1 }])
      await acao(pedido.ID, 'efetuarPagamento', CARTAO_RECUSADO)
      const { data: antes } = await api.get(`${P}/Pedidos${api.chave(pedido.ID)}/pagamento`)

      await api.editar(P, 'Pedidos', pedido.ID)
      const { data: pagRascunho } = await api.get(`${P}/Pedidos${api.chave(pedido.ID, false)}/pagamento`)
      const escrita = await falha(api.patch(`${P}/Pagamentos${api.chave(pagRascunho.ID, false)}`, { statusPagamento_code: 'APROVADO' }))
      assert.ok(escrita.status >= 400)

      const { data: linhas } = await api.get(`${P}/Pedidos${api.chave(pedido.ID, false)}/itens`)
      await api.patch(`${P}/ItensPedido${api.chave(linhas.value[0].ID, false)}`, { qtdeItemPedido: 2 })
      await api.ativar(P, 'Pedidos', pedido.ID)
      const { data: depois } = await api.get(`${P}/Pedidos${api.chave(pedido.ID)}/pagamento`)
      assert.equal(depois.statusPagamento_code, 'RECUSADO')
      assert.equal(depois.cartaoMascarado, antes.cartaoMascarado)
    })
  })
})
