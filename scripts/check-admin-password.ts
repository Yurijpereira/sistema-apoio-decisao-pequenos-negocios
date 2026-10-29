import assert from 'node:assert/strict'
import { getPrisma } from '../server/utils/prisma.ts'
import { hashPassword, verifyPassword } from '../server/utils/password.ts'
import { localTestServer } from './local-test-server.ts'

const server = localTestServer(3116)
const db = getPrisma()
const password = `${server.password} nova`
const raw = (
  path: string,
  method = 'GET',
  body?: unknown,
  cookie = server.sessionCookie(),
  extra: Record<string, string> = {},
) =>
  fetch(`${server.base}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      origin: server.base,
      'content-type': 'application/json',
      connection: 'close',
      ...(cookie ? { cookie } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })
async function signIn(value: string): Promise<string> {
  const response = await raw('/api/auth/login', 'POST', { password: value }, '')
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')?.split(';')[0]
  assert.ok(cookie)
  return cookie
}
const body = (currentPassword: string, value = password) => ({
  currentPassword,
  password: value,
  confirmation: value,
})
try {
  await server.start()
  await server.api(
    'products',
    'POST',
    { name: 'DEMO preservado na troca de senha', salePriceCents: 1000, unitCostCents: 800 },
    201,
  )
  const products = await db.product.findMany({ orderBy: { id: 'asc' } })
  const oldCookie = server.sessionCookie()
  const externalFingerprint = (await db.adminSession.findUniqueOrThrow({ where: { id: 1 } }))
    .credentialFingerprint
  assert.equal((await raw('/minha-conta', 'GET', undefined, '')).status, 302)
  assert.equal((await raw('/minha-conta', 'GET', undefined, oldCookie)).status, 200)
  assert.equal((await raw('/api/auth/password', 'PUT', body(server.password), '')).status, 401)
  assert.equal(
    (
      await raw('/api/auth/password', 'PUT', body(server.password), oldCookie, {
        origin: 'https://evil.example',
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await raw('/api/auth/password', 'PUT', body(server.password), oldCookie, {
        'x-forwarded-for': '127.0.0.1',
      })
    ).status,
    403,
  )
  assert.equal((await raw('/api/auth/password', 'PUT', body('incorreta'), oldCookie)).status, 401)
  assert.equal(await db.adminAccount.count(), 0)
  const changed = await raw('/api/auth/password', 'PUT', body(server.password), oldCookie)
  assert.equal(changed.status, 200)
  assert.match(changed.headers.get('set-cookie') ?? '', /Max-Age=0/)
  assert.equal(await db.adminSession.count(), 0)
  const account = await db.adminAccount.findUniqueOrThrow({ where: { id: 1 } })
  assert.equal(account.environmentFingerprint, externalFingerprint)
  assert.equal(await verifyPassword(password, account.passwordHash), true)
  assert.equal(await verifyPassword(server.password, account.passwordHash), false)
  assert.equal((await raw('/api/products', 'GET', undefined, oldCookie)).status, 401)
  assert.equal(
    (await raw('/api/auth/login', 'POST', { password: server.password }, '')).status,
    401,
  )
  let cookie = await signIn(password)
  await server.stop()
  await server.start(true, false)
  assert.equal((await raw('/api/products', 'GET', undefined, cookie)).status, 200)
  assert.equal((await raw('/api/health')).status, 200)
  const candidates = [`${password} A`, `${password} B`] as const
  const attempts = await Promise.all(
    candidates.map((value) => raw('/api/auth/password', 'PUT', body(password, value), cookie)),
  )
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 401])
  const winner = candidates[attempts.findIndex((r) => r.status === 200)]
  assert.ok(winner)
  const current = await db.adminAccount.findUniqueOrThrow({ where: { id: 1 } })
  assert.equal(await verifyPassword(winner, current.passwordHash), true)
  assert.equal((await raw('/api/products', 'GET', undefined, cookie)).status, 401)
  cookie = await signIn(winner)
  // Mudar a configuração externa explicitamente continua sendo uma forma de recuperação.
  const recoveryPassword = `${server.password} recuperação`
  await server.stop()
  await server.start(true, false, undefined, await hashPassword(recoveryPassword))
  assert.equal((await raw('/api/products', 'GET', undefined, cookie)).status, 401)
  assert.equal((await raw('/api/auth/login', 'POST', { password: winner }, '')).status, 401)
  await signIn(recoveryPassword)
  await server.stop()
  await server.start(true, false, undefined, '')
  cookie = await signIn(winner)
  const databasePassword = `${server.password} somente banco`
  assert.equal(
    (await raw('/api/auth/password', 'PUT', body(winner, databasePassword), cookie)).status,
    200,
  )
  assert.equal(
    (await db.adminAccount.findUniqueOrThrow({ where: { id: 1 } })).environmentFingerprint,
    null,
  )
  await server.stop()
  await server.start(true, false, undefined, '')
  cookie = await signIn(databasePassword)
  for (let index = 0; index < 5; index++) {
    assert.equal((await raw('/api/auth/password', 'PUT', body('incorreta'), cookie)).status, 401)
  }
  assert.equal((await raw('/api/auth/password', 'PUT', body(databasePassword), cookie)).status, 429)
  await server.stop()
  await server.start(true, false, undefined, '')
  assert.equal((await raw('/api/auth/password', 'PUT', body(databasePassword), cookie)).status, 429)
  assert.deepEqual(await db.product.findMany({ orderBy: { id: 'asc' } }), products)
  assert.equal(await db.sale.count(), 0)
  assert.equal(await db.expense.count(), 0)
  for (const secret of [
    server.password,
    password,
    winner,
    databasePassword,
    account.passwordHash,
  ]) {
    assert.ok(!server.output().includes(secret))
  }
  console.log(
    'PASS: Minha conta protegida, troca autenticada nas contas externa/banco, senha antiga recusada, sessão revogada, persistência após reinício, concorrência 200/401, recuperação externa, limite persistente e dados preservados.',
  )
} finally {
  await server.cleanup()
}
