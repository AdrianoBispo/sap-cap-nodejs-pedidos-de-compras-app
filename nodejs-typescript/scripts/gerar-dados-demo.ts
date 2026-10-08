/**
 * Gera os arquivos CSV de db/data com as CodeLists e a massa de demonstração.
 *
 * Porte das classes ZCL_PC_SETUP (CodeLists), ZCL_SETUP_CLIENTE, ZCL_SETUP_ESTOQUE
 * e ZCL_SETUP_PEDIDOS do projeto RAP: 100 clientes (cada um com endereço
 * principal), 100 itens e 100 pedidos em todos os status, com reservas, baixas,
 * pagamentos, snapshots e solicitações de reembolso coerentes com o estoque.
 *
 * Os dados são determinísticos (UUIDs derivados de um hash), então rodar o
 * script de novo produz os mesmos arquivos.
 *
 * Uso: npm run dados:demo (tsx scripts/gerar-dados-demo.ts)
 */
/* eslint-disable no-console -- script de linha de comando */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const pastaDados = join(raiz, 'db', 'data')
const NS = 'pedidoscompras'
const USUARIO = 'setup'
const AGORA = new Date('2026-10-01T12:00:00.000Z')

/** Linha de CSV: coluna -> valor. */
type Linha = Record<string, string | number | boolean | null | undefined>
/** Código, texto e criticidade (opcional) de uma CodeList. */
type ValorCodeList = [code: string, name: string, criticality?: number]
/** CEP, logradouro, bairro, cidade, UF e estado. */
type DadosCep = [cep: string, logradouro: string, bairro: string, cidade: string, uf: string, estado: string]

interface Endereco {
  ID: string
  cliente_ID: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  estado: string
  cepGeral: boolean
  cepStatus: string
  principal: boolean
}

interface Cliente {
  ID: string
  cpf: string
  nome: string
  email: string
  telefone: string
  genero_code: string
  dataNascimento: string
  clienteAtivo: boolean
  scoreCliente: number
}

interface Item {
  ID: string
  sku: string
  nome: string
  descricao: string
  categoria_code: string
  qtdeEstoque: number
  qtdeReservada: number
  currency_code: string
  precoUnitario: number
  itemAtivo: boolean
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

/** UUID v4 determinístico a partir de um texto. */
function uuid(texto: string): string {
  const h = createHash('sha1').update(texto).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** Dígitos verificadores de CPF para uma base de 9 dígitos (calcular_dv_cpf). */
function cpfComDigitos(base9: number): string {
  let cpf = String(base9)
  for (let rodada = 0; rodada < 2; rodada++) {
    const tamanho = cpf.length
    let soma = 0
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i)
    let resto = (soma * 10) % 11
    if (resto === 10) resto = 0
    cpf += resto
  }
  return cpf
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function formatarEndereco({ logradouro, numero, complemento, bairro, cidade, uf, cep }: Endereco): string {
  const comp = complemento ? ` - ${complemento}` : ''
  return `${logradouro}, ${numero}${comp} - ${bairro} - ${cidade}/${uf} - CEP ${cep.slice(0, 5)}-${cep.slice(5)}`
}

function diasAtras(dias: number, horas = 0): string {
  return new Date(AGORA.getTime() - (dias * 24 + horas) * 3600 * 1000).toISOString()
}

function csv(valor: Linha[string]): string {
  if (valor === null || valor === undefined) return ''
  const texto = String(valor)
  return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

function gravar(entidade: string, linhas: object[]): void {
  const colunas = Object.keys(linhas[0])
  const conteudo = [colunas.join(';'), ...(linhas as Linha[]).map(l => colunas.map(c => csv(l[c])).join(';'))].join('\n')
  writeFileSync(join(pastaDados, `${entidade}.csv`), conteudo + '\n', 'utf8')
  console.log(`${entidade}.csv: ${linhas.length} linha(s)`)
}

const admin = () => ({ createdAt: AGORA.toISOString(), createdBy: USUARIO, modifiedAt: AGORA.toISOString(), modifiedBy: USUARIO })

// ---------------------------------------------------------------------------
// CodeLists (ZCL_PC_SETUP->carregar_codelists)
// ---------------------------------------------------------------------------

const codelists: Record<string, ValorCodeList[]> = {
  Generos: [
    ['MASCULINO', 'Masculino'], ['FEMININO', 'Feminino'], ['NAO_BINARIO', 'Não binário'],
    ['OUTRO', 'Outro'], ['NAO_INFORMADO', 'Prefiro não informar']
  ],
  Categorias: [
    ['ELETRONICOS', 'Eletrônicos'], ['INFORMATICA', 'Informática'], ['ESCRITORIO', 'Escritório'],
    ['CASA', 'Casa e decoração'], ['VESTUARIO', 'Vestuário'], ['ALIMENTOS', 'Alimentos'], ['OUTROS', 'Outros']
  ],
  StatusPedido: [
    ['ABERTO', 'Aberto', 0], ['AGUARDANDO_APROVACAO', 'Aguardando aprovação', 2],
    ['PROCESSANDO_REEMBOLSO', 'Processando reembolso', 2], ['CANCELADO', 'Cancelado', 1], ['FINALIZADO', 'Finalizado', 3]
  ],
  StatusPagamento: [
    ['PENDENTE', 'Pendente', 2], ['APROVADO', 'Aprovado', 3], ['RECUSADO', 'Recusado', 1], ['DEVOLVIDO', 'Devolvido', 0]
  ],
  StatusReembolso: [['PENDENTE', 'Pendente', 2], ['APROVADO', 'Aprovado', 3], ['REJEITADO', 'Rejeitado', 1]],
  StatusEstoque: [['SEM_ESTOQUE', 'Sem estoque', 1], ['ACABANDO', 'Acabando', 2], ['EM_ESTOQUE', 'Em estoque', 3]],
  MetodosPagamento: [['CARTAO_CREDITO', 'Cartão de crédito'], ['CARTAO_DEBITO', 'Cartão de débito']]
}

// ---------------------------------------------------------------------------
// Clientes (ZCL_SETUP_CLIENTE)
// ---------------------------------------------------------------------------

const nomes: [nome: string, genero: string][] = [
  ['Maria', 'FEMININO'], ['João', 'MASCULINO'], ['Ana', 'FEMININO'], ['Carlos', 'MASCULINO'],
  ['Juliana', 'FEMININO'], ['Pedro', 'MASCULINO'], ['Fernanda', 'FEMININO'], ['Lucas', 'MASCULINO'],
  ['Camila', 'FEMININO'], ['Rafael', 'MASCULINO'], ['Patrícia', 'FEMININO'], ['Marcelo', 'MASCULINO'],
  ['Luciana', 'FEMININO'], ['Bruno', 'MASCULINO'], ['Beatriz', 'FEMININO'], ['Felipe', 'MASCULINO'],
  ['Aline', 'FEMININO'], ['Gustavo', 'MASCULINO'], ['Renata', 'FEMININO'], ['Eduardo', 'MASCULINO']
]
const sobrenomes = [
  'Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima',
  'Araújo', 'Fernandes', 'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Ribeiro', 'Barbosa', 'Moreira', 'Cardoso'
]
const ceps: DadosCep[] = [
  ['01001000', 'Praça da Sé', 'Sé', 'São Paulo', 'SP', 'São Paulo'],
  ['01310100', 'Avenida Paulista', 'Bela Vista', 'São Paulo', 'SP', 'São Paulo'],
  ['04538133', 'Avenida Brigadeiro Faria Lima', 'Itaim Bibi', 'São Paulo', 'SP', 'São Paulo'],
  ['20011000', 'Rua da Assembleia', 'Centro', 'Rio de Janeiro', 'RJ', 'Rio de Janeiro'],
  ['22021001', 'Avenida Atlântica', 'Copacabana', 'Rio de Janeiro', 'RJ', 'Rio de Janeiro'],
  ['30130003', 'Avenida Afonso Pena', 'Centro', 'Belo Horizonte', 'MG', 'Minas Gerais'],
  ['40020000', 'Rua Chile', 'Centro', 'Salvador', 'BA', 'Bahia'],
  ['50060004', 'Avenida Conde da Boa Vista', 'Boa Vista', 'Recife', 'PE', 'Pernambuco'],
  ['60165121', 'Avenida Beira Mar', 'Meireles', 'Fortaleza', 'CE', 'Ceará'],
  ['80020310', 'Rua XV de Novembro', 'Centro', 'Curitiba', 'PR', 'Paraná'],
  ['90020007', 'Rua dos Andradas', 'Centro Histórico', 'Porto Alegre', 'RS', 'Rio Grande do Sul']
]

const clientes: (Cliente & Linha)[] = []
const enderecos: (Endereco & Linha)[] = []
for (let i = 1; i <= 100; i++) {
  const [primeiro, genero] = nomes[(i - 1) % nomes.length]
  const nome = `${primeiro} ${sobrenomes[i % sobrenomes.length]} ${sobrenomes[(i * 7 + 3) % sobrenomes.length]}`
  const email = `${semAcento(nome).toLowerCase().replace(/ /g, '.')}.${i}@example.com`
  const dataNascimento = `${1960 + (i % 44)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`
  const ID = uuid(`cliente-${i}`)
  clientes.push({
    ID, ...admin(),
    cpf: cpfComDigitos(100000000 + i * 3571),
    nome, email,
    telefone: `${11 + (i % 20)}9${20000000 + i * 123457}`.slice(0, 11),
    genero_code: i % 17 === 0 ? 'NAO_INFORMADO' : genero,
    dataNascimento,
    clienteAtivo: i % 15 !== 0,
    scoreCliente: 30 + ((i * 37) % 70)
  })
  const [cep, logradouro, bairro, cidade, uf, estado] = ceps[(i - 1) % ceps.length]
  enderecos.push({
    ID: uuid(`endereco-${i}`), ...admin(),
    cliente_ID: ID, cep, logradouro,
    numero: String(10 + ((i * 37) % 990)),
    complemento: i % 3 === 0 ? `Apto ${101 + (i % 400)}` : '',
    bairro, cidade, uf, estado,
    cepGeral: false, cepStatus: 'V', principal: true
  })
}

// ---------------------------------------------------------------------------
// Itens de estoque (ZCL_SETUP_ESTOQUE)
// ---------------------------------------------------------------------------

const bases: [nome: string, descricao: string, categoria: string, preco: number][] = [
  ['Notebook 14 polegadas', 'Notebook para uso profissional', 'INFORMATICA', 3499.9],
  ['Mouse sem fio', 'Mouse óptico sem fio', 'INFORMATICA', 89.9],
  ['Teclado mecânico', 'Teclado mecânico ABNT2', 'INFORMATICA', 349.9],
  ['Monitor 24 polegadas', 'Monitor Full HD', 'INFORMATICA', 899.0],
  ['Webcam Full HD', 'Webcam com microfone embutido', 'INFORMATICA', 219.9],
  ['Fone Bluetooth', 'Fone de ouvido Bluetooth', 'ELETRONICOS', 199.0],
  ['Caixa de som portátil', "Caixa de som Bluetooth à prova d'água", 'ELETRONICOS', 259.9],
  ['Smartwatch', 'Relógio inteligente com GPS', 'ELETRONICOS', 599.0],
  ['Carregador USB-C 65W', 'Carregador rápido USB-C', 'ELETRONICOS', 129.9],
  ['Tablet 10 polegadas', 'Tablet para estudo e trabalho', 'ELETRONICOS', 1499.0],
  ['Cadeira de escritório', 'Cadeira ergonômica', 'ESCRITORIO', 899.0],
  ['Mesa de escritório', 'Mesa com gaveteiro', 'ESCRITORIO', 649.0],
  ['Luminária de mesa LED', 'Luminária com ajuste de intensidade', 'ESCRITORIO', 79.9],
  ['Agenda planejador', 'Agenda anual com capa dura', 'ESCRITORIO', 39.9],
  ['Organizador de mesa', 'Organizador multiuso de mesa', 'ESCRITORIO', 49.9],
  ['Jogo de panelas', 'Jogo de panelas antiaderentes', 'CASA', 399.9],
  ['Aspirador de pó', 'Aspirador de pó vertical', 'CASA', 459.0],
  ['Conjunto de toalhas', 'Conjunto de toalhas de algodão', 'CASA', 119.9],
  ['Almofada decorativa', 'Almofada decorativa para sofá', 'CASA', 59.9],
  ['Ventilador de mesa', 'Ventilador silencioso 3 velocidades', 'CASA', 189.9],
  ['Camiseta de algodão', 'Camiseta básica de algodão', 'VESTUARIO', 69.9],
  ['Tênis esportivo', 'Tênis para corrida', 'VESTUARIO', 329.9],
  ['Jaqueta corta-vento', 'Jaqueta leve corta-vento', 'VESTUARIO', 249.9],
  ['Café especial 500g', 'Café torrado e moído', 'ALIMENTOS', 42.9],
  ['Garrafa térmica', 'Garrafa térmica de aço inox', 'OUTROS', 79.9]
]
const variantes: [variante: string, fator: number][] = [['Básico', 1.0], ['Standard', 1.15], ['Plus', 1.3], ['Premium', 1.5]]

const itens: (Item & Linha)[] = []
let sequencialSku = 0
for (let i = 0; i < 100; i++) {
  const [nomeBase, descricao, categoria, preco] = bases[i % bases.length]
  const [variante, fator] = variantes[Math.floor(i / bases.length)]
  const estoque = i % 20 === 0 ? 0 : i % 20 === 7 ? 5 : 40 + ((i * 13) % 160)
  sequencialSku++
  itens.push({
    ID: uuid(`item-${i}`), ...admin(),
    sku: `SKU-${categoria.slice(0, 3)}-${String(sequencialSku).padStart(10, '0')}`,
    nome: `${nomeBase} ${variante}`,
    descricao: `${descricao} - linha ${variante}`,
    categoria_code: categoria,
    qtdeEstoque: estoque,
    qtdeReservada: 0,
    currency_code: 'BRL',
    precoUnitario: Math.round(preco * fator * 100) / 100,
    itemAtivo: true
  })
}

// ---------------------------------------------------------------------------
// Pedidos (ZCL_SETUP_PEDIDOS)
// ---------------------------------------------------------------------------

const padrao = [
  'FINALIZADO', 'AGUARDANDO_APROVACAO', 'ABERTO', 'FINALIZADO', 'ABERTO', 'PROCESSANDO_REEMBOLSO',
  'FINALIZADO', 'AGUARDANDO_APROVACAO', 'CANCELADO', 'ABERTO', 'FINALIZADO', 'ABERTO',
  'AGUARDANDO_APROVACAO', 'PROCESSANDO_REEMBOLSO', 'FINALIZADO', 'ABERTO', 'ABERTO', 'CANCELADO',
  'FINALIZADO', 'AGUARDANDO_APROVACAO'
]
const motivosCancelamento = [
  'Desistência da compra', 'Compra realizada em duplicidade', 'Endereço de entrega incorreto', 'Prazo de entrega muito longo'
]
const motivosReembolso = [
  'Produto chegou com defeito', 'Produto diferente do anunciado', 'Desistência da compra após o pagamento',
  'Cobrança em duplicidade no cartão', 'Atraso na entrega', 'Pedido realizado por engano',
  'Produto danificado no transporte', 'Item faltando no pedido', 'Encontrei preço menor em outra loja',
  'Cobrança não reconhecida'
]

const clientesAtivos = clientes
  .map((c, idx) => ({ ...c, endereco: enderecos[idx] }))
  .filter(c => c.clienteAtivo)
  .sort((a, b) => a.cpf.localeCompare(b.cpf))
const itensAtivos = [...itens].sort((a, b) => a.sku.localeCompare(b.sku))

const pedidos: Linha[] = []
const itensPedido: Linha[] = []
const pagamentos: Linha[] = []
const reembolsos: Linha[] = []
const snapshotsCliente: Linha[] = []
const snapshotsItens: Linha[] = []
let numeroPedido = 0
let qtdeReembolsos = 0

for (let i = 1; i <= 100; i++) {
  const status = padrao[(i - 1) % padrao.length]
  const cli = clientesAtivos[(i - 1) % clientesAtivos.length]
  const finalizado = status === 'FINALIZADO'
  const cancelado = status === 'CANCELADO'
  const reembolso = status === 'PROCESSANDO_REEMBOLSO'

  // 1 a 3 linhas, só com itens que tenham saldo disponível
  const linhas: { idx: number, qtde: number }[] = []
  for (let k = 1; k <= 1 + (i % 3); k++) {
    const qtde = 1 + ((i + k) % 3)
    for (let s = 1; s <= itensAtivos.length; s++) {
      const idx = (i * 7 + k * 13 + s) % itensAtivos.length
      const item = itensAtivos[idx]
      if (item.qtdeEstoque - item.qtdeReservada >= qtde && !linhas.some(l => l.idx === idx)) {
        linhas.push({ idx, qtde })
        break
      }
    }
  }
  if (!linhas.length) continue

  const dias = 2 + Math.floor(((100 - i) * 88) / 100)
  const criadoEm = diasAtras(dias, i % 24)
  const eventoEm = diasAtras(dias - 1, i % 24)
  const pedidoID = uuid(`pedido-${i}`)
  numeroPedido++

  let total = 0
  for (const linha of linhas) {
    const item = itensAtivos[linha.idx]
    const valor = Math.round(linha.qtde * item.precoUnitario * 100) / 100
    total += valor
    const itemPedidoID = uuid(`item-pedido-${i}-${linha.idx}`)
    itensPedido.push({
      ID: itemPedidoID, createdAt: criadoEm, createdBy: USUARIO, modifiedAt: criadoEm, modifiedBy: USUARIO,
      pedido_ID: pedidoID, item_ID: item.ID, qtdeItemPedido: linha.qtde,
      precoUnitarioSnapshot: item.precoUnitario, currency_code: 'BRL', valorTotal: valor, observacao: ''
    })
    if (finalizado || cancelado) {
      snapshotsItens.push({
        ID: uuid(`snap-item-${i}-${linha.idx}`), createdAt: eventoEm, createdBy: USUARIO, modifiedAt: eventoEm, modifiedBy: USUARIO,
        pedido_ID: pedidoID, itemPedido_ID: itemPedidoID, item_ID: item.ID, sku: item.sku, nome: item.nome,
        descricao: item.descricao, categoria_code: item.categoria_code, quantidade: linha.qtde,
        currency_code: 'BRL', precoUnitario: item.precoUnitario, valorTotal: valor
      })
    }
    // Finalizado: baixa. Cancelado: reserva já liberada. Demais: reserva ativa.
    if (finalizado) item.qtdeEstoque -= linha.qtde
    else if (!cancelado) item.qtdeReservada += linha.qtde
  }
  total = Math.round(total * 100) / 100

  const statusPagamento =
    status === 'ABERTO' && i % 3 === 0 ? 'RECUSADO'
      : status === 'ABERTO' || cancelado ? 'PENDENTE'
        : reembolso || finalizado || status === 'AGUARDANDO_APROVACAO' ? 'APROVADO' : 'PENDENTE'

  const pedido: Linha & { numeroPedido: string, enderecoPrincipalCompleto: string } = {
    ID: pedidoID, createdAt: criadoEm, createdBy: USUARIO, modifiedAt: eventoEm, modifiedBy: USUARIO,
    numeroPedido: String(numeroPedido).padStart(10, '0'),
    cliente_ID: cli.ID, endereco_ID: cli.endereco.ID,
    enderecoPrincipalCompleto: formatarEndereco(cli.endereco),
    statusPedido_code: status, statusPagamento_code: statusPagamento,
    observacao: `Pedido de demonstração ${i}`,
    currency_code: 'BRL', valorTotal: total,
    dataFinalizacao: finalizado ? eventoEm : '',
    motivoCancelamento: '', dataCancelamento: '', canceladoPor: ''
  }
  if (cancelado) {
    pedido.motivoCancelamento = motivosCancelamento[(i - 1) % motivosCancelamento.length]
    pedido.dataCancelamento = eventoEm
    pedido.canceladoPor = USUARIO
  }
  if (reembolso) {
    qtdeReembolsos++
    const motivo = motivosReembolso[(qtdeReembolsos - 1) % motivosReembolso.length]
    pedido.motivoCancelamento = motivo
    reembolsos.push({
      ID: uuid(`reembolso-${i}`), createdAt: eventoEm, createdBy: USUARIO, modifiedAt: eventoEm, modifiedBy: USUARIO,
      pedido_ID: pedidoID, numeroPedido: pedido.numeroPedido, cliente_ID: cli.ID,
      statusReembolso_code: 'PENDENTE', statusPedidoAnterior_code: 'AGUARDANDO_APROVACAO',
      currency_code: 'BRL', valorReembolso: total, motivoSolicitacao: motivo,
      dataSolicitacao: eventoEm, solicitadoPor: USUARIO, motivoDecisao: '', dataDecisao: '', decididoPor: ''
    })
  }
  pedidos.push(pedido)

  if (statusPagamento !== 'PENDENTE') {
    const aprovado = statusPagamento === 'APROVADO'
    const ultimos4 = String(1000 + ((i * 37) % 9000))
    const bandeira = i % 2 === 0 ? 'VISA' : 'MASTERCARD'
    pagamentos.push({
      ID: uuid(`pagamento-${i}`), createdAt: eventoEm, createdBy: USUARIO, modifiedAt: eventoEm, modifiedBy: USUARIO,
      pedido_ID: pedidoID, metodoPagamento_code: i % 3 === 0 ? 'CARTAO_DEBITO' : 'CARTAO_CREDITO',
      statusPagamento_code: statusPagamento, bandeiraCartao: bandeira, ultimos4DigitosCartao: ultimos4,
      cartaoMascarado: `**** **** **** ${ultimos4}`,
      codigoAutorizacao: aprovado ? `SIM${100000 + ((i * 7919) % 900000)}` : '',
      mensagemPagamento: aprovado ? `Pagamento aprovado (simulação) - ${bandeira}.` : 'Pagamento recusado pela operadora (simulação).',
      dataPagamento: eventoEm
    })
  }

  if (finalizado || cancelado) {
    const e = cli.endereco
    snapshotsCliente.push({
      ID: uuid(`snap-cliente-${i}`), createdAt: eventoEm, createdBy: USUARIO, modifiedAt: eventoEm, modifiedBy: USUARIO,
      pedido_ID: pedidoID, cliente_ID: cli.ID, cpf: cli.cpf, nome: cli.nome, email: cli.email, telefone: cli.telefone,
      genero_code: cli.genero_code, dataNascimento: cli.dataNascimento, clienteAtivo: cli.clienteAtivo,
      scoreCliente: cli.scoreCliente, endereco_ID: e.ID, cep: e.cep, logradouro: e.logradouro, numero: e.numero,
      complemento: e.complemento, bairro: e.bairro, cidade: e.cidade, uf: e.uf, estado: e.estado,
      enderecoCompleto: pedido.enderecoPrincipalCompleto,
      motivoSnapshot: finalizado ? 'FINALIZACAO' : 'CANCELAMENTO'
    })
  }
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

mkdirSync(pastaDados, { recursive: true })
for (const [entidade, valores] of Object.entries(codelists)) {
  gravar(`${NS}-${entidade}`, valores.map(([code, name, criticality], idx) => ({
    code, name, descr: name, ordem: idx + 1, criticality: criticality ?? 0
  })))
}
gravar('sap.common-Currencies', [
  { code: 'BRL', symbol: 'R$', minorUnit: 2, name: 'Real brasileiro', descr: 'Real brasileiro' },
  { code: 'USD', symbol: 'US$', minorUnit: 2, name: 'Dólar americano', descr: 'Dólar americano' },
  { code: 'EUR', symbol: '€', minorUnit: 2, name: 'Euro', descr: 'Euro' }
])
gravar(`${NS}-Numeracoes`, [
  { objeto: 'PEDIDO', ultimoNumero: numeroPedido },
  { objeto: 'SKU', ultimoNumero: sequencialSku }
])
gravar(`${NS}-Clientes`, clientes)
gravar(`${NS}-Enderecos`, enderecos)
gravar(`${NS}-Itens`, itens)
gravar(`${NS}-Pedidos`, pedidos)
gravar(`${NS}-ItensPedido`, itensPedido)
gravar(`${NS}-Pagamentos`, pagamentos)
gravar(`${NS}-PedidosClienteSnapshots`, snapshotsCliente)
gravar(`${NS}-PedidosItensSnapshots`, snapshotsItens)
gravar(`${NS}-Reembolsos`, reembolsos)
