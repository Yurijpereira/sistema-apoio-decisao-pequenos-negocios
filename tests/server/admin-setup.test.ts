import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, it, vi } from 'vitest'
import type { Prisma } from '../../generated/prisma/client.ts'
import getSetup from '../../server/api/auth/setup.get.ts'
import postSetup from '../../server/api/auth/setup.post.ts'
import login from '../../server/api/auth/login.post.ts'
import pages from '../../server/middleware/admin-pages.ts'
import { hashPassword, validPasswordHash, verifyPassword } from '../../server/utils/password.ts'

const db = vi.hoisted(() => ({
  adminAccount: { findUnique: vi.fn() },
  adminSession: { upsert: vi.fn() },
  adminLoginLimit: { deleteMany: vi.fn() },
  $queryRaw: vi.fn(),
}))
vi.mock('../../server/utils/prisma.ts', () => ({ getPrisma: () => db }))
const server = createServer(
  toNodeListener(
    createApp()
      .use(pages)
      .use(
        createRouter()
          .get('/api/auth/setup', getSetup)
          .post('/api/auth/setup', postSetup)
          .post('/api/auth/login', login)
          .get(
            '/configurar-conta',
            defineEventHandler(() => 'Configurar conta'),
          )
          .get(
            '/entrar',
            defineEventHandler(() => 'Entrar'),
          ),
      ),
  ),
)
const password = 'frase sintética de configuração 123'
let base = ''
let existingHash = ''
let stored: { passwordHash: string } | null = null
const request = (method = 'GET', body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/auth/setup`, {
    method,
    headers: { origin: base, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
beforeAll(async () => {
  existingHash = await hashPassword(password)
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
  vi.stubEnv('ADMIN_PASSWORD_HASH', '')
  vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'true')
  vi.stubEnv('DATABASE_URL', 'postgresql://local:local@127.0.0.1:5433/visaoativa?schema=public')
  stored = null
  db.adminAccount.findUnique.mockImplementation(async () => stored)
  db.$queryRaw.mockImplementation(async (query: Prisma.Sql) => {
    if (query.sql.includes('"AdminAccount"')) {
      if (stored) {
        return []
      }
      const hash: unknown = query.values[0]
      assert.equal(typeof hash, 'string')
      assert.ok(typeof hash === 'string')
      stored = { passwordHash: hash }
      return [{ id: 1 }]
    }
    return [{ attempts: 1, windowEndsAt: new Date(Date.now() + 900000) }]
  })
})

describe('configuração inicial da conta única', () => {
  it('informa estado mínimo e direciona o primeiro acesso para a configuração', async () => {
    assert.deepEqual(await (await request()).json(), { configured: false })
    const entry = await fetch(`${base}/entrar`, { redirect: 'manual' })
    assert.equal(entry.status, 302)
    assert.equal(entry.headers.get('location'), '/configurar-conta')
    assert.equal((await fetch(`${base}/configurar-conta`)).status, 200)
  })
  it('preserva a credencial de ambiente e impede configuração ou sobrescrita', async () => {
    vi.stubEnv('ADMIN_PASSWORD_HASH', existingHash)
    assert.deepEqual(await (await request()).json(), { configured: true })
    assert.equal((await request('POST', { password, confirmation: password })).status, 409)
    const page = await fetch(`${base}/configurar-conta`, { redirect: 'manual' })
    assert.equal(page.headers.get('location'), '/entrar')
    assert.ok(db.adminAccount.findUnique.mock.calls.length > 0)
    assert.equal(db.$queryRaw.mock.calls.length, 0)
  })
  it('persiste somente hash, exige login separado e aceita a credencial criada', async () => {
    const response = await request('POST', { password, confirmation: password })
    assert.equal(response.status, 201)
    assert.deepEqual(await response.json(), { configured: true })
    assert.equal(response.headers.get('set-cookie'), null)
    const row: { passwordHash: string } | null = await db.adminAccount.findUnique()
    assert.ok(row && validPasswordHash(row.passwordHash))
    assert.equal(await verifyPassword(password, row.passwordHash), true)
    assert.doesNotMatch(row.passwordHash, /frase sintética/)
    const signedIn = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { origin: base, 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    assert.equal(signedIn.status, 200)
    assert.match(signedIn.headers.get('set-cookie') ?? '', /HttpOnly/)
    assert.deepEqual(await (await request()).json(), { configured: true })
    assert.equal((await request('POST', { password, confirmation: password })).status, 409)
  })
  it('valida tamanho, controles, confirmação, tipos e campos desconhecidos', async () => {
    for (const body of [
      { password: 'curta', confirmation: 'curta' },
      { password: 'a'.repeat(129), confirmation: 'a'.repeat(129) },
      { password: `${password}\n`, confirmation: `${password}\n` },
      { password, confirmation: 'diferente' },
      { password: 123, confirmation: 123 },
      { password, confirmation: password, role: 'admin' },
      {},
    ]) {
      assert.equal((await request('POST', body)).status, 400)
    }
    assert.equal(stored, null)
  })
  it('preserva flag local, origem, cabeçalhos de proxy, JSON e limite de corpo', async () => {
    const body = { password, confirmation: password }
    assert.equal((await request('POST', body, { origin: 'https://evil.example' })).status, 403)
    assert.equal((await request('GET', undefined, { 'x-forwarded-for': '127.0.0.1' })).status, 403)
    assert.equal((await request('POST', body, { 'content-type': 'text/plain' })).status, 415)
    assert.equal((await request('POST', { password: 'x'.repeat(5000) })).status, 413)
    vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'false')
    assert.equal((await request()).status, 403)
    assert.equal((await request('POST', body)).status, 403)
    assert.equal(db.adminAccount.findUnique.mock.calls.length, 0)
  })
  it('limita tentativas antes do hash e não altera a conta em chamadas concorrentes', async () => {
    db.$queryRaw.mockResolvedValueOnce([
      { attempts: 6, windowEndsAt: new Date(Date.now() + 900000) },
    ])
    const limited = await request('POST', { password, confirmation: password })
    assert.equal(limited.status, 429)
    assert.ok(Number(limited.headers.get('retry-after')) > 0)
    const results = await Promise.all([
      request('POST', { password, confirmation: password }),
      request('POST', { password: `${password} outro`, confirmation: `${password} outro` }),
    ])
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
  })
  it('falha fechado se configuração ou banco estiverem inválidos, sem expor segredos', async () => {
    vi.stubEnv('ADMIN_PASSWORD_HASH', 'configuração inválida')
    assert.equal((await request()).status, 503)
    assert.equal((await request('POST', { password, confirmation: password })).status, 503)
    vi.stubEnv('ADMIN_PASSWORD_HASH', '')
    db.adminAccount.findUnique.mockResolvedValueOnce({ passwordHash: 'inválido' })
    assert.equal((await request()).status, 503)
    db.adminAccount.findUnique.mockRejectedValueOnce(new Error('SEGREDO SQL'))
    const response = await request()
    assert.equal(response.status, 503)
    assert.doesNotMatch(await response.text(), /SEGREDO|SQL/)
  })
})
