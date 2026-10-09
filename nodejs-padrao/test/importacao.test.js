/**
 * Importação em massa por planilha (equivalente às classes de teste de
 * ZCL_PC_IMPORTACAO do RAP): sucesso e "tudo ou nada" para as três apps.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { iniciarServidor, falha, COMUM } from './apoio/contexto.js'
import { gerarXlsx } from './apoio/xlsx.js'
import { calcularDvCpf } from '../srv/lib/util.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const api = iniciarServidor()
const csv = linhas => Buffer.from(linhas.map(l => l.join(';')).join('\n')).toString('base64')
const importar = (servico, conteudo, opcoes) =>
  api.post(`/odata/v4/${servico}/importarPlanilha`, { arquivo: conteudo, nomeArquivo: 'dados' }, opcoes)

describe('importação por planilha', () => {
  it('clientes: cria um cliente por linha com o endereço principal (CSV)', async () => {
    const cpfs = [calcularDvCpf('700000001'), calcularDvCpf('700000002')]
    const { data } = await importar('clientes', csv([
      ['CPF', 'Nome', 'E-mail', 'Telefone', 'Gênero', 'Data de nascimento', 'CEP', 'Número', 'Complemento'],
      [cpfs[0], 'Importado Um', 'um@exemplo.com', '81988887777', 'Feminino', '10/05/1990', '01001000', '10', 'Sala 1'],
      [cpfs[1], 'Importado Dois', 'dois@exemplo.com', '8133334444', 'NAO_BINARIO', '1985-01-20', '70040010', '20', '']
    ]))
    assert.equal(data.registrosCriados, 2)
    const { data: cliente } = await api.get(`/odata/v4/clientes/Clientes?$filter=cpf eq '${cpfs[0]}'&$expand=enderecos`)
    assert.equal(cliente.value[0].genero_code, 'FEMININO')
    assert.equal(cliente.value[0].enderecos[0].logradouro, 'Praça da Sé')
    assert.equal(cliente.value[0].enderecos[0].principal, true)
  })

  it('clientes: qualquer erro cancela tudo e lista o motivo por linha', async () => {
    const valido = calcularDvCpf('700000010')
    const erro = await falha(importar('clientes', csv([
      ['CPF', 'Nome', 'E-mail', 'Telefone', 'Data de nascimento', 'CEP', 'Número'],
      [valido, 'Válido', 'ok@exemplo.com', '81988887777', '1990-01-01', '01001000', '1'],
      ['123', '', 'invalido', '1', '2999-01-01', '1', '']
    ])))
    const texto = JSON.stringify(erro)
    assert.match(texto, /Importação cancelada/)
    assert.match(texto, /Linha 3: CPF inválido/)
    assert.match(texto, /Linha 3: Nome é obrigatório/)
    const { data } = await api.get(`/odata/v4/clientes/Clientes?$filter=cpf eq '${valido}'`)
    assert.equal(data.value.length, 0, 'nada foi gravado')
  })

  it('clientes: CEP inexistente (ViaCEP) cancela a importação', async () => {
    const erro = await falha(importar('clientes', csv([
      ['CPF', 'Nome', 'E-mail', 'Telefone', 'Data de nascimento', 'CEP', 'Número'],
      [calcularDvCpf('700000020'), 'Sem CEP', 'cep@exemplo.com', '81988887777', '1990-01-01', '99999999', '1']
    ])))
    assert.match(JSON.stringify(erro), /Linha 2: CEP inválido/)
  })

  it('estoque: cria itens com SKU (XLSX) e recusa nomes repetidos', async () => {
    const xlsx = gerarXlsx([
      ['Nome', 'Descrição', 'Categoria', 'Quantidade em estoque', 'Preço unitário'],
      ['Importado Caneta', 'Caneta azul', 'Escritório', 100, '2,50'],
      ['Importado Lápis', 'Lápis HB', 'ESCRITORIO', 50, 1.2]
    ]).toString('base64')
    const { data } = await importar('estoque', xlsx)
    assert.equal(data.registrosCriados, 2)
    const { data: itens } = await api.get(`/odata/v4/estoque/Itens?$filter=startswith(nome,'Importado')&$orderby=nome`)
    assert.match(itens.value[0].sku, /^SKU-ESC-\d{10}$/)
    assert.equal(Number(itens.value[0].precoUnitario), 2.5)

    const repetido = await falha(importar('estoque', xlsx))
    assert.match(JSON.stringify(repetido), /já cadastrado/)
  })

  it('pedidos: agrupa linhas pela referência, registra ABERTO e reserva o estoque', async () => {
    const { data: clientes } = await api.get(`/odata/v4/pedidos/ClientesAtivos?$top=2&$orderby=cpf`)
    const { data: itens } = await api.get(`/odata/v4/pedidos/ItensAtivos?$filter=qtdeDisponivel ge 20&$top=2&$orderby=sku`)
    const [a, b] = itens.value
    const { data } = await importar('pedidos', csv([
      ['Pedido', 'CPF', 'SKU', 'Quantidade', 'Observação'],
      ['P1', clientes.value[0].cpf, a.sku, '2', 'Importado'],
      ['P1', clientes.value[0].cpf, b.sku, '1', ''],
      ['P2', clientes.value[1].cpf, a.sku, '3', '']
    ]), COMUM)
    assert.equal(data.registrosCriados, 2)
    const { data: saldo } = await api.get(`/odata/v4/estoque/Itens(ID=${a.ID},IsActiveEntity=true)`)
    assert.equal(saldo.qtdeDisponivel, a.qtdeDisponivel - 5)
  })

  it('pedidos: demanda acima do estoque na planilha inteira cancela tudo', async () => {
    const { data: clientes } = await api.get(`/odata/v4/pedidos/ClientesAtivos?$top=1`)
    const { data: itens } = await api.get(`/odata/v4/pedidos/ItensAtivos?$filter=qtdeDisponivel ge 1&$top=1`)
    const item = itens.value[0]
    const erro = await falha(importar('pedidos', csv([
      ['Pedido', 'CPF', 'SKU', 'Quantidade'],
      ['X1', clientes.value[0].cpf, item.sku, String(item.qtdeDisponivel)],
      ['X2', clientes.value[0].cpf, item.sku, '1']
    ])))
    assert.match(JSON.stringify(erro), /Estoque insuficiente para o item/)
  })

  it('pedidos: a mesma referência não é reimportada para o mesmo cliente', async () => {
    const { data: clientes } = await api.get(`/odata/v4/pedidos/ClientesAtivos?$top=2&$skip=2&$orderby=cpf`)
    const { data: itens } = await api.get(`/odata/v4/pedidos/ItensAtivos?$filter=qtdeDisponivel ge 10&$top=1&$orderby=sku desc`)
    const [a, b] = clientes.value
    const planilha = cpf => csv([['Pedido', 'CPF', 'SKU', 'Quantidade'], ['dup-1', cpf, itens.value[0].sku, '1']])

    assert.equal((await importar('pedidos', planilha(a.cpf))).data.registrosCriados, 1)
    const { data: criados } = await api.get(`/odata/v4/pedidos/Pedidos?$filter=referenciaImportacao eq 'DUP-1'&$select=ID,numeroPedido`)
    assert.equal(criados.value.length, 1, 'a referência é gravada em maiúsculas')
    const [pedido] = criados.value

    const repetido = await falha(importar('pedidos', planilha(a.cpf)))
    assert.match(JSON.stringify(repetido), new RegExp(`Linha 2: o pedido DUP-1 do cliente .+ já foi importado \\(pedido ${pedido.numeroPedido}\\)`))

    // Outro cliente pode usar a mesma referência
    assert.equal((await importar('pedidos', planilha(b.cpf))).data.registrosCriados, 1)
    // Pedido cancelado libera a referência
    await api.post(`/odata/v4/pedidos/Pedidos${api.chave(pedido.ID)}/PedidosService.cancelarPedido`, { motivoCancelamento: 'Importado por engano' })
    assert.equal((await importar('pedidos', planilha(a.cpf))).data.registrosCriados, 1)
  })

  it('pedidos: a referência é somente leitura e limitada a 40 caracteres', async () => {
    const { data: clientes } = await api.get(`/odata/v4/pedidos/ClientesAtivos?$top=1`)
    const erro = await falha(importar('pedidos', csv([
      ['Pedido', 'CPF', 'SKU', 'Quantidade'],
      ['R'.repeat(41), clientes.value[0].cpf, 'SKU-X', '1']
    ])))
    assert.match(JSON.stringify(erro), /Linha 2: Pedido \(referência\) excede 40 caracteres/)

    const { data: pedidos } = await api.get(`/odata/v4/pedidos/Pedidos?$filter=referenciaImportacao ne null and statusPedido_code eq 'ABERTO'&$top=1&$select=ID,referenciaImportacao`)
    const [pedido] = pedidos.value
    await api.editar('/odata/v4/pedidos', 'Pedidos', pedido.ID)
    await api.patch(`/odata/v4/pedidos/Pedidos${api.chave(pedido.ID, false)}`, { referenciaImportacao: 'OUTRA' })
    const ativo = await api.ativar('/odata/v4/pedidos', 'Pedidos', pedido.ID)
    assert.equal(ativo.referenciaImportacao, pedido.referenciaImportacao)
  })

  it('clientes e estoque exigem o perfil administrador', async () => {
    assert.equal((await falha(importar('clientes', csv([['CPF']]), COMUM))).status, 403)
    assert.equal((await falha(importar('estoque', csv([['Nome']]), COMUM))).status, 403)
  })

  it('os modelos de docs/modelos-importacao são importados (XLSX)', async () => {
    const pasta = join(import.meta.dirname, '..', '..', 'docs', 'modelos-importacao')
    const modelo = nome => readFileSync(join(pasta, `${nome}.xlsx`)).toString('base64')
    assert.equal((await importar('clientes', modelo('clientes'))).data.registrosCriados, 3)
    assert.equal((await importar('estoque', modelo('estoque'))).data.registrosCriados, 3)
    assert.equal((await importar('pedidos', modelo('pedidos'))).data.registrosCriados, 2)
    // Reenviar o mesmo modelo de pedidos não duplica os pedidos
    const repetido = await falha(importar('pedidos', modelo('pedidos')))
    assert.match(JSON.stringify(repetido), /o pedido P001 do cliente .+ já foi importado/)
  })
})
