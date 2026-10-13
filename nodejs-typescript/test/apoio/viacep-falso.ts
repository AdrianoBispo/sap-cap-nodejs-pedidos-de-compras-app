/**
 * Servidor HTTP local que imita o ViaCEP para os testes (sem rede externa).
 *  - CEPs em CEPS: endereço completo
 *  - 99999999: CEP inexistente ({"erro": true})
 *  - 55555555: serviço indisponível (HTTP 503)
 *  - 69990000: CEP geral de município (sem logradouro/bairro)
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

interface EnderecoViaCep {
  logradouro: string
  bairro: string
  localidade: string
  uf: string
  estado: string
}

/** CEPs conhecidos pelo ViaCEP falso e o endereço devolvido. */
export const CEPS: Record<string, EnderecoViaCep> = {
  '01001000': { logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP', estado: 'São Paulo' },
  '70040010': { logradouro: 'Esplanada dos Ministérios', bairro: 'Zona Cívico-Administrativa', localidade: 'Brasília', uf: 'DF', estado: 'Distrito Federal' },
  '64000020': { logradouro: 'Rua Areolino de Abreu', bairro: 'Centro', localidade: 'Teresina', uf: 'PI', estado: 'Piauí' },
  '69990000': { logradouro: '', bairro: '', localidade: 'Cidade Pequena', uf: 'AC', estado: 'Acre' }
}

export const CEP_INEXISTENTE = '99999999'
export const CEP_INDISPONIVEL = '55555555'
export const CEP_GERAL = '69990000'

export interface ViaCepFalso {
  url: string
  readonly chamadas: number
  fechar(): Promise<void>
}

/**
 * Sobe o ViaCEP falso numa porta livre de 127.0.0.1.
 * @returns url base,
 *   número de chamadas recebidas e função para encerrar o servidor
 */
export async function iniciarViaCepFalso(): Promise<ViaCepFalso> {
  let chamadas = 0
  const servidor = createServer((req, res) => {
    chamadas++
    const cep = req.url?.match(/\/(\d{8})\/json/)?.[1]
    if (cep === CEP_INDISPONIVEL) {
      res.writeHead(503).end()
      return
    }
    const dados = cep ? CEPS[cep] : undefined
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(dados ? { cep, ...dados } : { erro: true }))
  })
  await new Promise<void>(resolve => servidor.listen(0, '127.0.0.1', resolve))
  const { port } = servidor.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/ws`,
    get chamadas() { return chamadas },
    fechar: () => new Promise<void>(resolve => servidor.close(() => resolve()))
  }
}
