import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'
import type { Prisma } from '../../generated/prisma/client.ts'
import { afterAll, beforeAll, beforeEach, describe, it, vi } from 'vitest'
import changePassword from '../../server/api/auth/password.put.ts'
import login from '../../server/api/auth/login.post.ts'
import pages from '../../server/middleware/admin-pages.ts'
import { hashPassword, tokenDigest, verifyPassword } from '../../server/utils/password.ts'

const db = vi.hoisted(() => ({
  adminAccount: { findUnique: vi.fn(), upsert: vi.fn() },
  adminSession: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  adminLoginLimit: { deleteMany: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}))
vi.mock('../../server/utils/prisma.ts', () => ({ getPrisma: () => db }))
const server = createServer(
  toNodeListener(
    createApp()
      .use(pages)
      .use(
        createRouter()
          .put('/api/auth/password', changePassword)
          .post('/api/auth/login', login)
          .get(
            '/minha-conta',
            defineEventHandler(() => 'Minha conta'),
          ),
      ),
  ),
)
const currentPassword = 'frase atual sintética para teste 123'
const password = 'nova frase sintética para teste 456'
const token = 'a'.repeat(43)
const cookie = `visaoativa_session=${token}`
let base = '',
  externalHash = ''
let account: { passwordHash: string; environmentFingerprint: string | null } | null = null
let session: { tokenHash: string; credentialFingerprint: string; expiresAt: Date } | null = null
const request = (body: unknown, authenticated = true, headers: Record<string, string> = {}) =>
  fetch(base + '/api/auth/password', {
    method: 'PUT',
    headers: {
      origin: base,
      'content-type': 'application/json',
      ...(authenticated ? { cookie } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  })
beforeAll(async () => {
  externalHash = await hashPassword(currentPassword)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  base = `http://127.0.0.1:${address.port}`
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  vi.unstubAllEnvs()
})
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'true')
  vi.stubEnv('ADMIN_PASSWORD_HASH', externalHash)
  vi.stubEnv('DATABASE_URL', 'postgresql://local:local@127.0.0.1:5433/visaoativa?schema=public')
  account = null
  session = {
    tokenHash: tokenDigest(token),
    credentialFingerprint: tokenDigest(externalHash),
    expiresAt: new Date(Date.now() + 100000),
  }
  db.adminAccount.findUnique.mockImplementation(async () => account)
  db.adminAccount.upsert.mockImplementation(
    async ({ create }: { create: NonNullable<typeof account> }) => {
      account = create
      return account
    },
  )
  db.adminSession.findUnique.mockImplementation(async () => session)
  db.adminSession.upsert.mockImplementation(
    async ({ create }: { create: NonNullable<typeof session> }) => {
      session = create
      return session
    },
  )
  db.adminSession.deleteMany.mockImplementation(async () => {
    session = null
    return { count: 1 }
  })
  db.$transaction.mockImplementation((run: (tx: typeof db) => Promise<unknown>) => run(db))
  db.$queryRaw.mockImplementation(async (query: Prisma.Sql) =>
    query.sql.includes('FOR UPDATE')
      ? session
        ? [{ id: 1 }]
        : []
      : [{ attempts: 1, windowEndsAt: new Date(Date.now() + 900000) }],
  )
})
describe('troca autenticada de senha', () => {
  it('persiste hash vinculado ao ambiente sem alterar a configuração e revoga a sessão', async () => {
    const response = await request({ currentPassword, password, confirmation: password })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { authenticated: false })
    assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=0/)
    const row: NonNullable<typeof account> = db.adminAccount.upsert.mock.calls[0]?.[0].create
    assert.equal(await verifyPassword(password, row.passwordHash), true)
    assert.equal(await verifyPassword(currentPassword, row.passwordHash), false)
    assert.equal(row.environmentFingerprint, tokenDigest(externalHash))
    assert.equal(process.env.ADMIN_PASSWORD_HASH, externalHash)
    assert.equal(session, null)
    assert.equal((await request({ currentPassword, password, confirmation: password })).status, 401)
    const page = await fetch(base + '/minha-conta', { headers: { cookie }, redirect: 'manual' })
    assert.equal(page.headers.get('location'), '/entrar')
    const signedIn = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { origin: base, 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    assert.equal(signedIn.status, 200)
  })
  it('atualiza uma conta criada no banco e permite recuperação externa explícita', async () => {
    account = { passwordHash: externalHash, environmentFingerprint: null }
    vi.stubEnv('ADMIN_PASSWORD_HASH', '')
    assert.equal((await request({ currentPassword, password, confirmation: password })).status, 200)
    assert.equal(db.adminAccount.upsert.mock.calls[0]?.[0].update.environmentFingerprint, null)
  })
  it('exige sessão e senha atual correta, sem alterar senha ou revogar em caso de erro', async () => {
    assert.equal(
      (await request({ currentPassword, password, confirmation: password }, false)).status,
      401,
    )
    assert.equal(
      (await request({ currentPassword: 'incorreta', password, confirmation: password })).status,
      401,
    )
    assert.equal(db.adminAccount.upsert.mock.calls.length, 0)
    assert.equal(db.adminSession.deleteMany.mock.calls.length, 0)
  })
  it('valida limites, confirmação, diferença da senha e campos desconhecidos', async () => {
    for (const body of [
      { currentPassword, password: 'curta', confirmation: 'curta' },
      { currentPassword, password: 'a'.repeat(129), confirmation: 'a'.repeat(129) },
      { currentPassword, password: `${password}\n`, confirmation: `${password}\n` },
      { currentPassword, password, confirmation: 'outra' },
      { currentPassword, password: currentPassword, confirmation: currentPassword },
      { currentPassword, password, confirmation: password, role: 'admin' },
    ]) {
      assert.equal((await request(body)).status, 400)
    }
    assert.equal(db.$transaction.mock.calls.length, 0)
  })
  it('barra origem, proxy, corpo inválido e acesso desabilitado antes da alteração', async () => {
    const body = { currentPassword, password, confirmation: password }
    assert.equal((await request(body, true, { origin: 'https://evil.example' })).status, 403)
    assert.equal((await request(body, true, { 'x-forwarded-for': '127.0.0.1' })).status, 403)
    assert.equal((await request(body, true, { 'content-type': 'text/plain' })).status, 415)
    assert.equal((await request({ currentPassword: 'a'.repeat(5000) })).status, 413)
    vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'false')
    assert.equal((await request(body)).status, 403)
    assert.equal(db.$transaction.mock.calls.length, 0)
  })
  it('limita tentativas e revalida a sessão depois do hash', async () => {
    db.$queryRaw.mockResolvedValueOnce([
      { attempts: 6, windowEndsAt: new Date(Date.now() + 900000) },
    ])
    const response = await request({ currentPassword, password, confirmation: password })
    assert.equal(response.status, 429)
    assert.ok(Number(response.headers.get('retry-after')) > 0)
    db.$transaction.mockImplementationOnce((run: (tx: typeof db) => Promise<unknown>) => {
      session = null
      return run(db)
    })
    assert.equal((await request({ currentPassword, password, confirmation: password })).status, 401)
    assert.equal(db.adminAccount.upsert.mock.calls.length, 0)
  })
  it('não expõe falhas de banco nem altera a credencial em transação rejeitada', async () => {
    db.$transaction.mockRejectedValueOnce(new Error('SEGREDO SQL'))
    const response = await request({ currentPassword, password, confirmation: password })
    assert.equal(response.status, 503)
    assert.doesNotMatch(await response.text(), /SEGREDO|SQL/)
    assert.equal(account, null)
  })
})
