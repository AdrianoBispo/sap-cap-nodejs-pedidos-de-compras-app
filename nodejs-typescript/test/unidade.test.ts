/**
 * Testes de unidade das funções puras (equivalentes a ltcl_digitos_cpf,
 * ltcl_email_imagem, ltcl_estoque_endereco e às classes de teste de
 * ZCL_PC_PAGAMENTO_SIM e ZCL_PC_PLANILHA do RAP). Não sobem servidor.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validarCpf, calcularDvCpf, formatarCpf, validarEmail, validarTelefone, validarImagem,
  calcularStatusEstoque, formatarEndereco, prefixoCategoria, montarSku, somarQuantidades
} from '../srv/lib/util.js'
import { simularPagamento, type EntradaPagamento } from '../srv/lib/pagamento-simulado.js'
import { lerPlanilha, paraData, paraDecimal, paraInteiro, normalizarNome, MAX_LINHAS } from '../srv/lib/planilha.js'
import { gerarXlsx } from './apoio/xlsx.js'

const PNG = Buffer.from('89504e470d0a1a0a0000', 'hex')
const JPEG = Buffer.from('ffd8ffe000104a464946', 'hex')
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')])

describe('utilitários', () => {
  it('CPF: dígitos verificadores, sequências repetidas e formatação', () => {
    assert.equal(calcularDvCpf('529982247'), '52998224725')
    assert.equal(validarCpf('529.982.247-25'), true)
    assert.equal(validarCpf('52998224724'), false)
    assert.equal(validarCpf('11111111111'), false)
    assert.equal(validarCpf('123'), false)
    assert.equal(formatarCpf('52998224725'), '529.982.247-25')
  })

  it('e-mail e telefone', () => {
    assert.equal(validarEmail('Ana.Souza@Exemplo.com.br'), true)
    assert.equal(validarEmail('ana@exemplo'), false)
    assert.equal(validarEmail('sem-arroba.com'), false)
    assert.equal(validarTelefone('(81) 3333-4444'), true)
    assert.equal(validarTelefone('81999998888'), true)
    assert.equal(validarTelefone('999'), false)
  })

  it('imagens: JPEG, PNG e WEBP com MIME, extensão e assinatura coerentes', () => {
    assert.equal(validarImagem(null, null, null), true, 'foto é opcional')
    assert.equal(validarImagem(PNG, 'image/png', 'foto.png'), true)
    assert.equal(validarImagem(JPEG, 'image/jpeg', 'foto.jpg'), true)
    assert.equal(validarImagem(WEBP, 'image/webp', 'foto.webp'), true)
    assert.equal(validarImagem(PNG, 'image/gif', 'foto.gif'), false)
    assert.equal(validarImagem(PNG, 'image/png', 'foto.exe'), false)
    assert.equal(validarImagem(JPEG, 'image/png', 'foto.png'), false, 'assinatura não confere com o MIME')
  })

  it('status de estoque: SEM_ESTOQUE (0), ACABANDO (1-10), EM_ESTOQUE (>= 11)', () => {
    assert.equal(calcularStatusEstoque(0), 'SEM_ESTOQUE')
    assert.equal(calcularStatusEstoque(1), 'ACABANDO')
    assert.equal(calcularStatusEstoque(10), 'ACABANDO')
    assert.equal(calcularStatusEstoque(11), 'EM_ESTOQUE')
  })

  it('endereço completo, SKU e soma de quantidades', () => {
    assert.equal(
      formatarEndereco({ logradouro: 'Rua A', numero: '10', complemento: 'Apto 1', bairro: 'Centro', cidade: 'Recife', uf: 'PE', cep: '50060004' }),
      'Rua A, 10 - Apto 1 - Centro - Recife/PE - CEP 50060-004'
    )
    assert.equal(prefixoCategoria('eletronicos'), 'ELE')
    assert.equal(prefixoCategoria('TV'), 'TVX')
    assert.equal(montarSku('INFORMATICA', 42), 'SKU-INF-0000000042')
    const totais = somarQuantidades([{ item_ID: 'a', qtdeItemPedido: 2 }, { item_ID: 'a', qtdeItemPedido: 3 }, { item_ID: 'b', qtdeItemPedido: 1 }])
    assert.deepEqual([...totais], [['a', 5], ['b', 1]])
  })
})

describe('pagamento simulado', () => {
  const hoje = new Date('2026-10-08')
  const base = { metodo: 'CARTAO_CREDITO', numero: '4111 1111 1111 1111', validade: '12/30', cvv: '123' }

  it('aprovado: VISA, últimos 4 dígitos e máscara; nada sensível no resultado', () => {
    const r = simularPagamento(base, hoje)
    assert.ok(r.dadosValidos)
    assert.equal(r.status, 'APROVADO')
    assert.equal(r.bandeira, 'VISA')
    assert.equal(r.ultimos4, '1111')
    assert.equal(r.cartaoMascarado, '**** **** **** 1111')
    assert.match(r.codigoAutorizacao ?? '', /^SIM\d{6}$/)
    assert.equal(JSON.stringify(r).includes('4111111111111111'), false)
    assert.equal(JSON.stringify(r).includes('123'), false)
  })

  it('MASTERCARD e recusa com CVV 000', () => {
    const r = simularPagamento({ ...base, numero: '5500000000000004', cvv: '000' }, hoje)
    assert.ok(r.dadosValidos)
    assert.equal(r.bandeira, 'MASTERCARD')
    assert.equal(r.status, 'RECUSADO')
    assert.equal(r.codigoAutorizacao, null)
  })

  it('dados inválidos são erro de entrada, não recusa', () => {
    const casos: [EntradaPagamento, RegExp][] = [
      [{ metodo: 'PIX' }, /método/],
      [{ numero: '4111' }, /13 a 19 dígitos/],
      [{ validade: '1230' + '1' }, /MM\/AA/],
      [{ cvv: '12' }, /CVV/],
      [{ validade: '13/30' }, /mês/],
      [{ validade: '09/26' }, /expirado/]
    ]
    for (const [alteracao, erro] of casos) {
      const r = simularPagamento({ ...base, ...alteracao }, hoje)
      assert.ok(!r.dadosValidos)
      assert.match(r.erro, erro)
    }
    assert.equal(simularPagamento({ ...base, validade: '10/26' }, hoje).dadosValidos, true, 'mês corrente ainda vale')
  })
})

describe('leitor de planilhas', () => {
  const colunas = [
    { campo: 'Nome', sinonimos: ['NOMECOMPLETO'], obrigatoria: true },
    { campo: 'Data de nascimento', obrigatoria: true },
    { campo: 'Valor' }
  ]

  it('CSV com ";", BOM, aspas e cabeçalho sem acento/caixa', () => {
    const csv = Buffer.from('﻿nome completo;DATA DE NASCIMENTO;valor;extra\n"Silva; Ana";10/05/1990;"1.234,56";x\n\nJoão;1990-05-11;;\n', 'utf8')
    const { registros, erros } = lerPlanilha(csv, colunas)
    assert.deepEqual(erros, [])
    assert.equal(registros.length, 2)
    assert.equal(registros[0].linha, 2)
    assert.equal(registros[0].valores.Nome, 'Silva; Ana')
    assert.equal(registros[1].linha, 4)
    assert.equal(paraDecimal(registros[0].valores.Valor), 1234.56)
  })

  it('CSV com "," e tabulação; ISO-8859-1 quando não é UTF-8', () => {
    assert.equal(lerPlanilha(Buffer.from('Nome,Data de nascimento\nAna,1990-01-01\n'), colunas).registros.length, 1)
    assert.equal(lerPlanilha(Buffer.from('Nome\tData de nascimento\nAna\t1990-01-01\n'), colunas).registros.length, 1)
    const latin1 = Buffer.from('Nome;Data de nascimento\nJosé;1990-01-01\n', 'latin1')
    assert.equal(lerPlanilha(latin1, colunas).registros[0].valores.Nome, 'José')
  })

  it('XLSX com textos compartilhados e com textos inline', () => {
    const linhas = [['Nome', 'Data de nascimento', 'Valor'], ['Ana & Cia', 32874, 10.5], ['Bia', '1991-02-03', 7]]
    for (const inline of [false, true]) {
      const { registros, erros } = lerPlanilha(gerarXlsx(linhas, { inline }), colunas)
      assert.deepEqual(erros, [])
      assert.equal(registros[0].valores.Nome, 'Ana & Cia')
      assert.equal(paraData(registros[0].valores['Data de nascimento']), '1990-01-01')
      assert.equal(registros[1].valores.Valor, '7')
    }
  })

  it('erros: coluna obrigatória ausente, sem dados, limite de linhas e .xls antigo', () => {
    assert.match(lerPlanilha(Buffer.from('Nome;Outro\nAna;1\n'), colunas).erros[0], /Data de nascimento/)
    assert.match(lerPlanilha(Buffer.from('Nome;Data de nascimento\n'), colunas).erros[0], /não possui linhas de dados/)
    const muitas = 'Nome;Data de nascimento\n' + 'Ana;1990-01-01\n'.repeat(MAX_LINHAS + 1)
    assert.match(lerPlanilha(Buffer.from(muitas), colunas).erros[0], /máximo é 500/)
    assert.match(lerPlanilha(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), colunas).erros[0], /\.xls/)
    assert.match(lerPlanilha(Buffer.alloc(0), colunas).erros[0], /vazio/)
  })

  it('conversões de data, número e nome de coluna', () => {
    assert.equal(paraData('31/12/2000'), '2000-12-31')
    assert.equal(paraData('2000-02-30'), null)
    assert.equal(paraData('abc'), null)
    assert.equal(paraDecimal('R$ 89,90'), 89.9)
    assert.equal(paraDecimal('89.90'), 89.9)
    assert.equal(paraInteiro('10,0'), 10)
    assert.equal(paraInteiro('10,5'), null)
    assert.equal(normalizarNome('Preço unitário'), 'PRECOUNITARIO')
  })
})
