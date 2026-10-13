/**
 * Gestão de Clientes: rascunho, CPF, endereços com ViaCEP, endereço principal,
 * validações de CPF, e-mail e telefone, autorização e exclusão.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { iniciarServidor, falha, COMUM, type Opcoes } from './apoio/contexto.js'
import { CEP_INEXISTENTE, CEP_INDISPONIVEL, CEP_GERAL } from './apoio/viacep-falso.js'
import { calcularDvCpf } from '../srv/lib/util.js'

const api = iniciarServidor()
const C = '/odata/v4/clientes'
let sequencia = 500

/** CPF válido e inédito a cada chamada. */
const novoCpf = () => calcularDvCpf(String(900000000 + sequencia++ * 7919).slice(0, 9))

/** Endereço digitado no rascunho (o número pode faltar para testar a validação). */
interface EnderecoDigitado {
  cep: string
  numero?: string
}

async function rascunhoCliente(dados: Record<string, unknown> = {}, enderecos: EnderecoDigitado[] = [{ cep: '01001000', numero: '100' }]) {
  const { data: cliente } = await api.post(`${C}/Clientes`, {})
  await api.patch(`${C}/Clientes${api.chave(cliente.ID, false)}`, {
    cpf: novoCpf(), nome: 'Cliente de Teste', email: 'Teste@Exemplo.com', telefone: '81999990000',
    dataNascimento: '1990-05-10', ...dados
  })
  const ids: string[] = []
  for (const endereco of enderecos) {
    const { data } = await api.post(`${C}/Clientes${api.chave(cliente.ID, false)}/enderecos`, {})
    await api.patch(`${C}/Enderecos${api.chave(data.ID, false)}`, endereco)
    ids.push(data.ID)
  }
  return { ID: cliente.ID, enderecos: ids }
}

describe('Gestão de Clientes', () => {
  it('cria cliente com endereço preenchido pelo ViaCEP, ativo e com score', async () => {
    const { ID, enderecos } = await rascunhoCliente()
    const { data: end } = await api.get(`${C}/Enderecos${api.chave(enderecos[0], false)}`)
    assert.equal(end.logradouro, 'Praça da Sé')
    assert.equal(end.cidade, 'São Paulo')
    assert.equal(end.cep, '01001000')
    assert.equal(end.cepStatus, 'V')
    assert.equal(end.principal, true, 'primeiro endereço vira principal')

    const cliente = await api.ativar(C, 'Clientes', ID)
    assert.equal(cliente.clienteAtivo, true)
    assert.ok(cliente.scoreCliente >= 0 && cliente.scoreCliente <= 100)
    assert.equal(cliente.email, 'teste@exemplo.com')
    assert.equal(cliente.telefone, '81999990000')
    assert.match(cliente.cpfFormatado, /^\d{3}\.\d{3}\.\d{3}-\d{2}$/)
    assert.equal(cliente.telefoneFormatado, '(81) 99999-0000')
  })

  it('CEP já cadastrado é reaproveitado sem chamar o ViaCEP', async () => {
    const antes = api.viacep.chamadas
    await rascunhoCliente({}, [{ cep: '22021001', numero: '5' }])
    assert.equal(api.viacep.chamadas, antes)
  })

  it('CPF inválido ou duplicado bloqueia o Save', async () => {
    const invalido = await rascunhoCliente({ cpf: '12345678900' })
    assert.match((await falha(api.ativar(C, 'Clientes', invalido.ID))).message, /CPF inválido/)

    const { data } = await api.get(`${C}/Clientes?$filter=IsActiveEntity eq true&$top=1`)
    const duplicado = await rascunhoCliente({ cpf: data.value[0].cpf })
    assert.match((await falha(api.ativar(C, 'Clientes', duplicado.ID))).message, /Já existe um cliente/)
  })

  it('e-mail, telefone e data de nascimento são validados', async () => {
    const email = await rascunhoCliente({ email: 'sem-arroba' })
    assert.match((await falha(api.ativar(C, 'Clientes', email.ID))).message, /E-mail em formato inválido/)
    const telefone = await rascunhoCliente({ telefone: '123' })
    assert.match(JSON.stringify(await falha(api.ativar(C, 'Clientes', telefone.ID))), /Telefone deve conter 10 ou 11 dígitos/)
    const nascimento = await rascunhoCliente({ dataNascimento: '2999-01-01' })
    assert.match(JSON.stringify(await falha(api.ativar(C, 'Clientes', nascimento.ID))), /Data de nascimento não pode ser futura/)
  })

  it('CEP inexistente ou ViaCEP indisponível bloqueiam o Save', async () => {
    const inexistente = await rascunhoCliente({}, [{ cep: CEP_INEXISTENTE, numero: '1' }])
    assert.match((await falha(api.ativar(C, 'Clientes', inexistente.ID))).message, /CEP inválido/)

    const indisponivel = await rascunhoCliente({}, [{ cep: CEP_INDISPONIVEL, numero: '1' }])
    assert.match((await falha(api.ativar(C, 'Clientes', indisponivel.ID))).message, /Não foi possível validar o CEP/)
  })

  it('CEP geral exige logradouro e bairro informados pelo usuário', async () => {
    const { ID, enderecos } = await rascunhoCliente({}, [{ cep: CEP_GERAL, numero: '10' }])
    const { data: end } = await api.get(`${C}/Enderecos${api.chave(enderecos[0], false)}`)
    assert.equal(end.cepGeral, true)
    assert.equal(end.controleCampoCep, 7)
    assert.match((await falha(api.ativar(C, 'Clientes', ID))).message, /Logradouro é obrigatório/)

    await api.patch(`${C}/Enderecos${api.chave(enderecos[0], false)}`, { logradouro: 'Rua Única', bairro: 'Centro' })
    const cliente = await api.ativar(C, 'Clientes', ID)
    assert.equal(cliente.IsActiveEntity, true)
  })

  it('número do endereço é obrigatório e o CEP é único por cliente', async () => {
    const semNumero = await rascunhoCliente({}, [{ cep: '01001000' }])
    assert.match(JSON.stringify(await falha(api.ativar(C, 'Clientes', semNumero.ID))), /Número do endereço é obrigatório/)

    const repetido = await rascunhoCliente({}, [{ cep: '01001000', numero: '1' }, { cep: '01001000', numero: '2' }])
    assert.match(JSON.stringify(await falha(api.ativar(C, 'Clientes', repetido.ID))), /mesmo CEP|com este CEP/)
  })

  it('definir endereço principal desmarca os demais (rascunho e ativo)', async () => {
    const { ID, enderecos } = await rascunhoCliente({}, [{ cep: '01001000', numero: '1' }, { cep: '70040010', numero: '2' }])
    await api.post(`${C}/Enderecos${api.chave(enderecos[1], false)}/ClientesService.definirEnderecoPrincipal`, {})
    await api.ativar(C, 'Clientes', ID)
    const { data } = await api.get(`${C}/Clientes${api.chave(ID)}/enderecos`)
    const principal = data.value.filter((e: { principal: boolean }) => e.principal)
    assert.equal(principal.length, 1)
    assert.equal(principal[0].ID, enderecos[1])

    await api.post(`${C}/Enderecos${api.chave(enderecos[0])}/ClientesService.definirEnderecoPrincipal`, {})
    const { data: depois } = await api.get(`${C}/Clientes${api.chave(ID)}?$expand=enderecos`)
    assert.equal(depois.enderecos.find((e: { principal: boolean }) => e.principal).ID, enderecos[0])
    assert.equal(depois.cidadePrincipal, 'São Paulo')
  })

  it('usuário comum consulta, mas não cria, edita nem exclui clientes', async () => {
    const { data } = await api.get(`${C}/Clientes?$top=1`, COMUM)
    assert.equal(data.value.length, 1)
    assert.equal((await falha(api.post(`${C}/Clientes`, {}, COMUM))).status, 403)
    assert.equal((await falha(api.post(`${C}/Clientes${api.chave(data.value[0].ID)}/ClientesService.draftEdit`, {}, COMUM))).status, 403)
  })

  it('a UI só oferece alteração ao Admin: Permissoes.somenteLeitura por usuário', async () => {
    const { data: admin } = await api.get(`${C}/Permissoes`)
    assert.equal(admin.somenteLeitura, false)
    const { data: comum } = await api.get(`${C}/Permissoes`, COMUM)
    assert.equal(comum.somenteLeitura, true)
  })

  it('cliente com pedido não pode ser excluído; sem pedido pode', async () => {
    const { data } = await api.get(`/odata/v4/pedidos/Pedidos?$filter=IsActiveEntity eq true&$top=1&$select=cliente_ID`)
    const erro = await falha(api.del(`${C}/Clientes${api.chave(data.value[0].cliente_ID)}`))
    assert.match(erro.message, /possui pedido vinculado/)

    const { ID } = await rascunhoCliente({}, [{ cep: '64000020', numero: '7' }])
    await api.ativar(C, 'Clientes', ID)
    await api.del(`${C}/Clientes${api.chave(ID)}`)
    assert.equal((await falha(api.get(`${C}/Clientes${api.chave(ID)}`))).status, 404)
  })

  it('foto aceita apenas JPEG, PNG ou WEBP com assinatura válida', async () => {
    const { ID } = await rascunhoCliente()
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
    await api.put(`${C}/Clientes${api.chave(ID, false)}/fotoCliente`, png, { ...ADMIN_BINARIO('image/png') })
    const falsa = Buffer.from('nao sou uma imagem')
    const erro = await falha(api.put(`${C}/Clientes${api.chave(ID, false)}/fotoCliente`, falsa, { ...ADMIN_BINARIO('image/png') }))
    assert.match(erro.message, /Formato de imagem inválido/)
  })
})

function ADMIN_BINARIO(tipo: string): Opcoes {
  return { auth: { username: 'admin', password: 'admin' }, headers: { 'content-type': tipo } }
}
