import assert from 'node:assert/strict'
import { getPrisma } from '../server/utils/prisma.ts'
import { localTestServer } from './local-test-server.ts'
import { seedDemo } from './demo-data.ts'
import { verifyBackup } from './backup.ts'
import { randomBytes } from 'node:crypto'

const server = localTestServer(3112)
const db = getPrisma()
try {
  await server.start()
  await seedDemo(db)
  const account = await db.adminAccount.create({
    data: {
      id: 1,
      passwordHash: `scrypt:131072:8:1:${randomBytes(16).toString('hex')}:${randomBytes(64).toString('hex')}`,
    },
  })
  await db.adminSession.create({
    data: {
      id: 1,
      tokenHash: randomBytes(32).toString('hex'),
      credentialFingerprint: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 3600000),
    },
  })
  await db.adminLoginLimit.create({
    data: { id: 1, attempts: 1, windowEndsAt: new Date(Date.now() + 900000) },
  })
  assert.equal(await db.adminSession.count(), 1)
  assert.equal(await db.adminLoginLimit.count(), 1)
  assert.deepEqual(await db.adminAccount.findUnique({ where: { id: 1 } }), account)
  const before = await db.sale.findMany({ orderBy: { id: 'asc' } })
  await verifyBackup(process.env)
  assert.deepEqual(await db.adminAccount.findUnique({ where: { id: 1 } }), account)
  assert.deepEqual(await db.sale.findMany({ orderBy: { id: 'asc' } }), before)
  assert.equal(await db.adminSession.count(), 1)
  assert.equal(await db.adminLoginLimit.count(), 1)
  console.log(
    'PASS: dump/restore PostgreSQL 17 com dados sintéticos, tabelas legadas de conta e sessão presentes; dados de negócio e migrações conferidos, credenciais/sessões/tentativas excluídas somente da cópia; banco/schema de origem preservados e destino descartável removido.',
  )
} finally {
  await server.cleanup()
}
