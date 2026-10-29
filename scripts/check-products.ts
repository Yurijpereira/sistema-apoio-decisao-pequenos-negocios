import { databaseTable } from '../server/utils/sql-table.ts'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { localTestServer, object, recordId } from './local-test-server.ts'
import { getPrisma } from '../server/utils/prisma.ts'

// Dados e sessão do usuário ficam fora do schema temporário deste teste.
const { base, start, stop, cleanup, sessionCookie, api: request } = localTestServer(3102)
const api = (path: string, method = 'GET', body?: unknown, expected = 200) =>
  request(`products${path}`, method, body, expected)
const db = getPrisma()

try {
  const connection = await db.$queryRaw<
    { database: string; version: string }[]
  >`SELECT current_database() AS database, version() AS version`
  const connected = connection[0]
  assert.ok(connected)
  assert.ok(connected.version.startsWith('PostgreSQL'))
  console.log('PostgreSQL real conectado:', connected.database, connected.version.split(' on ')[0])
  await start()
  for (const path of ['/', '/produtos']) {
    const response = await fetch(`${base}${path}`, { headers: { cookie: sessionCookie() } })
    assert.equal(response.status, 200)
    assert.match(await response.text(), /VisãoAtiva/)
  }
  const input = { name: `DEMO sintético ${randomUUID()}`, salePriceCents: 1000, unitCostCents: 800 }
  const product = await api('', 'POST', input, 201)
  const id = recordId(product)
  assert.equal(product.grossMarginPercent, 20)
  assert.equal(object(product.lowMargin).ruleId, 'LOW_MARGIN')
  assert.equal((await db.product.findUniqueOrThrow({ where: { id } })).salePriceCents, 1000)
  const edited = await api(`/${id}`, 'PUT', { ...input, salePriceCents: 2000 })
  assert.equal(edited.grossMarginPercent, 60)
  assert.equal(edited.lowMargin, null)
  assert.equal(edited.createdAt, product.createdAt)
  assert.equal((await db.product.findUniqueOrThrow({ where: { id } })).salePriceCents, 2000)
  await api(`/${id}`, 'PATCH', { active: false })
  assert.equal((await db.product.findUniqueOrThrow({ where: { id } })).active, false)
  const inactive = await api('?status=inactive')
  assert.ok(
    Array.isArray(inactive.items) && inactive.items.some((item: unknown) => object(item).id === id),
  )
  await stop()
  await start()
  assert.equal((await api(`/${id}`)).active, false)
  console.log(
    'PASS: criar → consultar → editar (20% → 60%) → desativar → reiniciar aplicação → consultar persistência.',
  )
  await api(`/${id}`, 'PATCH', { active: true })
  const zero = await api(`/${id}`, 'PUT', { ...input, salePriceCents: 0 })
  assert.equal(zero.grossMarginPercent, null)
  await api('', 'POST', { ...input, salePriceCents: -1 }, 400)
  await api('', 'POST', { ...input, salePriceCents: 2147483648 }, 400)
  await api(`/${randomUUID()}`, 'GET', undefined, 404)
  await assert.rejects(
    () =>
      db.$executeRaw`UPDATE ${databaseTable('Product')} SET "unitCostCents" = -1 WHERE "id" = ${id}::uuid`,
  )
  await assert.rejects(
    () =>
      db.$executeRaw`UPDATE ${databaseTable('Product')} SET "name" = '   ' WHERE "id" = ${id}::uuid`,
  )
  const untrusted = await fetch(`${base}/api/products`, {
    method: 'POST',
    headers: { origin: 'https://untrusted.invalid', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  assert.equal(untrusted.status, 403)
  await stop()
  await start(false)
  await api('', 'GET', undefined, 403)
  console.log(
    'PASS: preço zero, limites, 404, constraints PostgreSQL, origem externa e acesso desabilitado.',
  )
} finally {
  await cleanup()
  console.log(
    'Servidor encerrado; schema temporário e fixtures removidos, sem alterar os dados/sessão do banco principal.',
  )
}
