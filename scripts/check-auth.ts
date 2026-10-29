import assert from 'node:assert/strict'
import { getPrisma } from '../server/utils/prisma.ts'
import { tokenDigest } from '../server/utils/password.ts'
import { DEMO_EXPENSE_ID, DEMO_PRODUCT_ID, DEMO_SALE_IDS, seedDemo } from './demo-data.ts'
import { localTestServer, object } from './local-test-server.ts'

const { base, start, stop, cleanup, password } = localTestServer(3108)
const db = getPrisma()
let cookie = ''
async function raw(
  path: string,
  method = 'GET',
  body?: unknown,
  authenticated = false,
): Promise<Response> {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      origin: base,
      'content-type': 'application/json',
      ...(authenticated ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })
}
async function signIn(): Promise<string> {
  const response = await raw('/api/auth/login', 'POST', { password })
  assert.equal(response.status, 200)
  const header = response.headers.get('set-cookie') ?? ''
  assert.match(header, /HttpOnly/)
  assert.match(header, /SameSite=Strict/)
  const sessionCookie = header.split(';')[0]
  assert.ok(sessionCookie)
  return sessionCookie
}
try {
  await start(true, false)
  for (const [path, method] of [
    ['products', 'GET'],
    ['products', 'POST'],
    ['products/x', 'PUT'],
    ['products/x', 'PATCH'],
    ['sales', 'GET'],
    ['sales', 'POST'],
    ['sales/x', 'PUT'],
    ['expenses', 'GET'],
    ['expenses', 'POST'],
    ['expenses/x', 'PUT'],
    ['expenses/x', 'DELETE'],
    ['suggestions', 'GET'],
    ['period-summary', 'GET'],
  ]) {
    assert.ok(path && method)
    assert.equal((await raw(`/api/${path}`, method, method === 'GET' ? undefined : {})).status, 401)
  }
  assert.equal(await db.product.count(), 0)
  // Várias solicitações concorrentes continuam reservando apenas cinco verificações de senha.
  const attempts = await Promise.all(
    Array.from({ length: 8 }, () =>
      raw('/api/auth/login', 'POST', { password: 'senha errada de teste concorrente' }),
    ),
  )
  assert.equal(attempts.filter((response) => response.status === 401).length, 5)
  assert.equal(attempts.filter((response) => response.status === 429).length, 3)
  assert.equal((await raw('/api/auth/login', 'POST', { password })).status, 429)
  await stop()
  await start(true, false)
  assert.equal((await raw('/api/auth/login', 'POST', { password })).status, 429)
  // Somente a fixture do schema temporário é vencida para não esperar quinze minutos.
  await db.adminLoginLimit.update({ where: { id: 1 }, data: { windowEndsAt: new Date(0) } })
  cookie = await signIn()
  const token = cookie.split('=')[1]
  assert.ok(token)
  const stored = await db.adminSession.findUniqueOrThrow({ where: { id: 1 } })
  assert.equal(stored.tokenHash, tokenDigest(token))
  assert.notEqual(stored.tokenHash, token)
  assert.equal((await raw('/api/products', 'GET', undefined, true)).status, 200)
  await stop()
  await start(true, false)
  assert.equal((await raw('/api/products', 'GET', undefined, true)).status, 200)
  const stale = cookie
  cookie = await signIn()
  assert.notEqual(cookie, stale)
  assert.equal((await fetch(`${base}/api/products`, { headers: { cookie: stale } })).status, 401)
  assert.equal(
    (
      await fetch(`${base}/api/auth/logout`, {
        method: 'POST',
        headers: { origin: base, 'content-type': 'application/json', cookie: stale },
        body: '{}',
      })
    ).status,
    200,
  )
  assert.equal((await raw('/api/products', 'GET', undefined, true)).status, 200)
  assert.equal(await seedDemo(db), 'created')
  const demo = await db.sale.findMany({
    where: { id: { in: DEMO_SALE_IDS } },
    orderBy: { id: 'asc' },
  })
  assert.equal(await seedDemo(db), 'preserved')
  assert.deepEqual(
    await db.sale.findMany({ where: { id: { in: DEMO_SALE_IDS } }, orderBy: { id: 'asc' } }),
    demo,
  )
  const report = object(
    await (
      await raw('/api/suggestions?to=2026-10-14&recordsComplete=true', 'GET', undefined, true)
    ).json(),
  )
  assert.ok(Array.isArray(report.suggestions))
  assert.deepEqual(
    report.suggestions.map((item) => object(item).ruleId),
    ['BELOW_COST', 'LOW_MARGIN', 'EXPENSE_PRESSURE', 'SALES_DROP'],
  )
  const currentSale = demo.find((sale) => sale.date.toISOString().slice(0, 10) === '2026-10-08')
  assert.ok(currentSale)
  const corrected = await raw(
    `/api/sales/${currentSale.id}`,
    'PUT',
    {
      productId: DEMO_PRODUCT_ID,
      date: '2026-10-08',
      quantity: 25,
      unitPriceCents: 2000,
      unitCostCents: 800,
    },
    true,
  )
  assert.equal(corrected.status, 200)
  assert.equal(await seedDemo(db), 'preserved')
  assert.equal(
    (await db.sale.findUniqueOrThrow({ where: { id: currentSale.id } })).unitPriceCents,
    2000,
  )
  await db.expense.delete({ where: { id: DEMO_EXPENSE_ID } })
  await assert.rejects(seedDemo(db), /parcialmente ocupados/)
  assert.equal(await db.expense.count(), 0)
  await db.adminSession.update({
    where: { id: 1 },
    data: { createdAt: new Date(Date.now() - 9 * 3600000), expiresAt: new Date(Date.now() - 1000) },
  })
  assert.equal((await raw('/api/products', 'GET', undefined, true)).status, 401)
  cookie = await signIn()
  assert.equal((await raw('/api/auth/logout', 'POST', {}, true)).status, 200)
  assert.equal((await raw('/api/products', 'GET', undefined, true)).status, 401)
  assert.equal(await db.adminSession.count(), 0)
  for (const path of ['/.env', '/.local/admin-credentials.txt']) {
    const response = await raw(path)
    assert.equal(response.status, 404)
    assert.doesNotMatch(await response.text(), new RegExp(password))
  }
  console.log(
    'PASS: PostgreSQL real, APIs autenticadas, cinco tentativas concorrentes/15min, limite e sessão persistem após reinício, rotação, token somente como digest, expiração, logout, seed idempotente/correções preservadas e arquivos privados inacessíveis por HTTP.',
  )
} finally {
  await cleanup()
}
