import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { parse } from 'dotenv'
import { getPrisma } from '../server/utils/prisma.ts'
import { databaseOperation } from '../server/utils/database-operation.ts'
import { hashPassword } from '../server/utils/password.ts'

const replace = process.argv.includes('--replace')
const content = await readFile('.env', 'utf8')
if (/^ADMIN_PASSWORD_HASH=.+/m.test(content) && !replace) {
  throw new Error(
    'Conta já provisionada. Use --replace somente para rotacionar a senha e invalidar a sessão atual.',
  )
}
// Uma conta criada pela interface também exige rotação explícita pela CLI.
const config = parse(content)
if (!config.DATABASE_URL) {
  throw new Error('Configure DATABASE_URL e aplique as migrações antes de provisionar a conta.')
}
process.env.DATABASE_URL = config.DATABASE_URL
const db = getPrisma()
try {
  const existing = await databaseOperation(() => db.adminAccount.findUnique({ where: { id: 1 } }))
  if (existing && !replace) {
    throw new Error(
      'Conta já configurada pela interface. Use --replace somente para recuperação explícita.',
    )
  }
} finally {
  await db.$disconnect()
}
// Senha aleatória; nunca é escrita em stdout, argumentos, código ou logs.
const password = randomBytes(24).toString('base64url')
const hash = await hashPassword(password)
await mkdir('.local', { recursive: true, mode: 0o700 })
await chmod('.local', 0o700)
await writeFile(
  '.local/admin-credentials.txt',
  `VisãoAtiva — conta administrativa local\nSenha: ${password}\n\nMantenha este arquivo privado. Rotacione com npm run admin:provision -- --replace.\n`,
  { mode: 0o600 },
)
await chmod('.local/admin-credentials.txt', 0o600)
const updated = /^ADMIN_PASSWORD_HASH=/m.test(content)
  ? content.replace(/^ADMIN_PASSWORD_HASH=.*$/m, `ADMIN_PASSWORD_HASH=${hash}`)
  : `${content.trimEnd()}\n\n# Conta administrativa local (somente hash scrypt).\nADMIN_PASSWORD_HASH=${hash}\n`
await writeFile('.env', updated, { mode: 0o600 })
await chmod('.env', 0o600)
console.log(
  'Conta provisionada. A senha está somente em .local/admin-credentials.txt (permissão 600); o hash está no .env. Reinicie o servidor após provisionar/rotacionar.',
)
