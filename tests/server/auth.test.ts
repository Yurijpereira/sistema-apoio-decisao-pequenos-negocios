import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createApp, createEvent, createRouter, defineEventHandler, toNodeListener } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, it, vi } from 'vitest'
import adminPages from '../../server/middleware/admin-pages.ts'
import login from '../../server/api/auth/login.post.ts'
import logout from '../../server/api/auth/logout.post.ts'
import session from '../../server/api/auth/session.get.ts'
import products from '../../server/api/products/index.get.ts'
import createProduct from '../../server/api/products/index.post.ts'
import getProduct from '../../server/api/products/[id].get.ts'
import updateProduct from '../../server/api/products/[id].put.ts'
import statusProduct from '../../server/api/products/[id].patch.ts'
import sales from '../../server/api/sales/index.get.ts'
import createSale from '../../server/api/sales/index.post.ts'
import updateSale from '../../server/api/sales/[id].put.ts'
import expenses from '../../server/api/expenses/index.get.ts'
import createExpense from '../../server/api/expenses/index.post.ts'
import updateExpense from '../../server/api/expenses/[id].put.ts'
import deleteExpense from '../../server/api/expenses/[id].delete.ts'
import summary from '../../server/api/period-summary.get.ts'
import suggestions from '../../server/api/suggestions.get.ts'
import {
  equalDigest,
  hashPassword,
  tokenDigest,
  validPassword,
  validPasswordHash,
  verifyPassword,
} from '../../server/utils/password.ts'
import { SESSION_COOKIE, signIn } from '../../server/utils/admin-session.ts'
import { validLoginPassword } from '../../shared/utils/password.ts'

const db = vi.hoisted(() => ({
  adminAccount: { findUnique: vi.fn() },
  adminSession: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  adminLoginLimit: { deleteMany: vi.fn() },
  $queryRaw: vi.fn(),
  product: { findMany: vi.fn(), count: vi.fn() },
}))
vi.mock('../../server/utils/prisma.ts', () => ({ getPrisma: () => db }))
const router = createRouter()
  .get(
    '/entrar',
    defineEventHandler(() => 'Entrada'),
  )
  .get(
    '/produtos',
    defineEventHandler(() => 'Página privada'),
  )
  .post('/api/auth/login', login)
  .post('/api/auth/logout', logout)
  .get('/api/auth/session', session)
  .get('/api/products', products)
  .post('/api/products', createProduct)
  .get('/api/products/:id', getProduct)
  .put('/api/products/:id', updateProduct)
  .patch('/api/products/:id', statusProduct)
  .get('/api/sales', sales)
  .post('/api/sales', createSale)
  .put('/api/sales/:id', updateSale)
  .get('/api/expenses', expenses)
  .post('/api/expenses', createExpense)
  .put('/api/expenses/:id', updateExpense)
  .delete('/api/expenses/:id', deleteExpense)
  .get('/api/period-summary', summary)
  .get('/api/suggestions', suggestions)
const server = createServer(toNodeListener(createApp().use(adminPages).use(router)))
let base = ''
let hash = ''
const password = 'senha sintética apenas para teste 123'
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie?: string,
  origin?: string,
): Promise<Response> {
  return fetch(`${base}/api/${path}`, {
    method,
    headers: {
      origin: origin ?? base,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
beforeAll(async () => {
  hash = await hashPassword(password)
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
  vi.stubEnv('ADMIN_PASSWORD_HASH', hash)
  vi.stubEnv('DATABASE_URL', 'postgresql://local:local@127.0.0.1:5433/visaoativa?schema=public')
  db.$queryRaw.mockResolvedValue([{ attempts: 1, windowEndsAt: new Date(Date.now() + 900000) }])
  db.adminSession.upsert.mockImplementation(async ({ create }: { create: object }) => create)
  db.adminSession.deleteMany.mockResolvedValue({ count: 1 })
  db.adminLoginLimit.deleteMany.mockResolvedValue({ count: 1 })
})

describe('conta administrativa e sessão', () => {
  it('verifica uma credencial curta configurada explicitamente sem reduzir a política de criação', async () => {
    const localPassword = 'local@123'
    const salt = 'c'.repeat(32)
    const key = scryptSync(localPassword, Buffer.from(salt, 'hex'), 64, {
      N: 131072,
      r: 8,
      p: 1,
      maxmem: 256 * 1024 * 1024,
    })
    const localHash = `scrypt:131072:8:1:${salt}:${key.toString('hex')}`
    await assert.rejects(hashPassword(localPassword), RangeError)
    assert.equal(await verifyPassword(localPassword, localHash), true)
    assert.equal(await verifyPassword('outra@123', localHash), false)
    for (const invalid of ['', 'a'.repeat(129), 'senha\nlocal', 123, null]) {
      assert.equal(validLoginPassword(invalid), false)
    }
    assert.equal(validLoginPassword('a'.repeat(128)), true)
    vi.stubEnv('ADMIN_PASSWORD_HASH', localHash)
    assert.equal((await request('auth/login', 'POST', { password: localPassword })).status, 200)
    assert.equal((await request('auth/login', 'POST', { password: 'outra@123' })).status, 401)
  })
  it('usa hash lento com salt, limites de senha e comparação segura', async () => {
    assert.ok(validPasswordHash(hash))
    assert.ok(validPassword(password))
    assert.equal(await verifyPassword(password, hash), true)
    assert.equal(await verifyPassword('outra senha de teste 123', hash), false)
    assert.equal(await verifyPassword(password, 'hash inválido'), false)
    assert.equal(validPassword('curta'), false)
    await assert.rejects(hashPassword('curta'), RangeError)
    assert.equal(equalDigest('x', tokenDigest('x')), false)
    assert.equal(equalDigest(tokenDigest('x'), tokenDigest('y')), false)
    assert.equal(equalDigest(tokenDigest('x'), tokenDigest('x')), true)
    assert.doesNotMatch(hash, /senha sintética/)
  })
  it('não permite nenhuma API de negócio sem sessão, inclusive leituras', async () => {
    for (const [path, method] of [
      ['products', 'GET'],
      ['products', 'POST'],
      ['products/x', 'GET'],
      ['products/x', 'PUT'],
      ['products/x', 'PATCH'],
      ['sales', 'GET'],
      ['sales', 'POST'],
      ['sales/x', 'PUT'],
      ['expenses', 'GET'],
      ['expenses', 'POST'],
      ['expenses/x', 'PUT'],
      ['expenses/x', 'DELETE'],
      ['period-summary', 'GET'],
      ['suggestions', 'GET'],
    ]) {
      assert.ok(path && method)
      assert.equal(
        (await request(path, method, method === 'GET' ? undefined : {})).status,
        401,
        `${method} ${path}`,
      )
    }
    assert.equal(db.product.findMany.mock.calls.length, 0)
    assert.equal(db.$queryRaw.mock.calls.length, 0)
  })
  it('redireciona páginas antes do SSR sem sessão, preservando o bloqueio local', async () => {
    const response = await fetch(`${base}/produtos`, { redirect: 'manual' })
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('location'), '/entrar')
    assert.equal((await fetch(`${base}/entrar`)).status, 200)
    vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'false')
    assert.equal((await fetch(`${base}/produtos`, { redirect: 'manual' })).status, 403)
  })
  it('retorna sessão ausente, configura cookie HttpOnly/Strict e armazena somente digest do token', async () => {
    assert.deepEqual(await (await request('auth/session')).json(), { authenticated: false })
    const response = await request('auth/login', 'POST', { password })
    assert.equal(response.status, 200)
    const cookie = response.headers.get('set-cookie')
    assert.ok(cookie && cookie.includes('HttpOnly') && cookie.includes('SameSite=Strict'))
    assert.match(cookie, /Max-Age=28800/)
    const token = /^visaoativa_session=([^;]+)/.exec(cookie)?.[1]
    assert.ok(token && token.length === 43)
    const data = db.adminSession.upsert.mock.calls[0]?.[0].create
    assert.equal(data.tokenHash, tokenDigest(token))
    assert.notEqual(data.tokenHash, token)
    assert.equal(data.credentialFingerprint, tokenDigest(hash))
    assert.doesNotMatch(JSON.stringify(await response.json()), new RegExp(token))
    db.adminSession.findUnique.mockResolvedValue(data)
    assert.deepEqual(
      await (await request('auth/session', 'GET', undefined, `${SESSION_COOKIE}=${token}`)).json(),
      { authenticated: true },
    )
    db.product.findMany.mockResolvedValue([])
    db.product.count.mockResolvedValue(0)
    assert.equal(
      (await request('products', 'GET', undefined, `${SESSION_COOKIE}=${token}`)).status,
      200,
    )
  })
  it('marca Secure quando a conexão direta é TLS', async () => {
    const socket = Object.assign(new Socket(), { encrypted: true })
    const req = new IncomingMessage(socket)
    req.headers.host = 'localhost'
    req.url = '/api/auth/login'
    const res = new ServerResponse(req)
    await signIn(createEvent(req, res), password)
    assert.match(String(res.getHeader('set-cookie')), /; Secure/)
    socket.destroy()
  })
  it('rejeita token forjado, expirado e sessão de senha rotacionada', async () => {
    const token = 'a'.repeat(43)
    const data = {
      tokenHash: tokenDigest(token),
      credentialFingerprint: tokenDigest(hash),
      expiresAt: new Date(Date.now() + 10000),
    }
    for (const row of [
      null,
      { ...data, tokenHash: tokenDigest('b') },
      { ...data, expiresAt: new Date(0) },
      { ...data, credentialFingerprint: tokenDigest('outro hash') },
    ]) {
      db.adminSession.findUnique.mockResolvedValue(row)
      assert.equal(
        (await request('products', 'GET', undefined, `${SESSION_COOKIE}=${token}`)).status,
        401,
      )
    }
    assert.equal(
      (await request('products', 'GET', undefined, `${SESSION_COOKIE}=invalido`)).status,
      401,
    )
  })
  it('barra tentativas após o limite persistente e não cria sessão com senha errada', async () => {
    assert.equal(
      (await request('auth/login', 'POST', { password: 'errada mas longa o suficiente' })).status,
      401,
    )
    assert.equal(db.adminSession.upsert.mock.calls.length, 0)
    db.$queryRaw.mockResolvedValue([{ attempts: 6, windowEndsAt: new Date(Date.now() + 900000) }])
    const blocked = await request('auth/login', 'POST', { password })
    assert.equal(blocked.status, 429)
    assert.ok(Number(blocked.headers.get('retry-after')) > 0)
  })
  it('revoga somente o token recebido, limpa cookie e impede CSRF ou bypass do guard', async () => {
    const token = 'a'.repeat(43)
    const response = await request('auth/logout', 'POST', {}, `${SESSION_COOKIE}=${token}`)
    assert.equal(response.status, 200)
    assert.equal(db.adminSession.deleteMany.mock.calls[0]?.[0].where.tokenHash, tokenDigest(token))
    assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=0/)
    assert.equal(
      (await request('auth/login', 'POST', { password }, undefined, 'https://evil.example')).status,
      403,
    )
    const proxy = await fetch(`${base}/api/auth/session`, {
      headers: { 'x-forwarded-for': '127.0.0.1' },
    })
    assert.equal(proxy.status, 403)
    vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'false')
    assert.equal((await request('auth/login', 'POST', { password })).status, 403)
  })
  it('falha fechado sem configuração e não expõe erro do banco', async () => {
    vi.stubEnv('ADMIN_PASSWORD_HASH', '')
    assert.equal((await request('auth/login', 'POST', { password })).status, 503)
    vi.stubEnv('ADMIN_PASSWORD_HASH', hash)
    db.$queryRaw.mockRejectedValue(new Error('password=SEGREDO'))
    const response = await request('auth/login', 'POST', { password })
    assert.equal(response.status, 503)
    assert.doesNotMatch(await response.text(), /SEGREDO/)
    assert.equal((await request('auth/login', 'POST', { password, role: 'admin' })).status, 400)
  })
})
