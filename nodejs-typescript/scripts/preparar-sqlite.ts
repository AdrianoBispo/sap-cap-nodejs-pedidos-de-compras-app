/**
 * Cria o banco SQLite local (db.sqlite) antes do cds watch, se ele ainda não
 * existir: roda cds deploy, que cria as tabelas e carrega os CSV de db/data.
 *
 * Com o arquivo já criado não faz nada, para manter os dados entre reinícios
 * (inclusive as fotos enviadas). Para recriar o banco depois de mudar o modelo
 * ou os CSV: npm run db:deploy.
 *
 * Uso: npm run watch (roda este script como prewatch, via tsx)
 */
/* eslint-disable no-console -- script de linha de comando */
import cds from '@sap/cds'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const db = cds.env.requires.db as { kind?: string, credentials?: { url?: string } } | undefined
const url = db?.credentials?.url
if (db?.kind === 'sqlite' && url && url !== ':memory:' && !existsSync(join(cds.root, url))) {
  console.log(`Criando o banco SQLite local em ${url} (cds deploy)...`)
  execSync('cds deploy', { stdio: 'inherit', cwd: cds.root })
}
