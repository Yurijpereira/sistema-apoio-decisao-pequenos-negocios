// Autorização exercitada na suíte auth; esta suíte isola persistência e regras de negócio.
import assert from 'node:assert/strict'
import { createServer, IncomingMessage, ServerResponse, request as nodeRequest } from 'node:http'
import { Socket } from 'node:net'
import { once } from 'node:events'
import { createApp, createEvent, createRouter, toNodeListener } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, it, vi } from 'vitest'
import { assertLocalAccess } from '../../server/utils/local-access.ts'
import list from '../../server/api/products/index.get.ts'
import create from '../../server/api/products/index.post.ts'
import get from '../../server/api/products/[id].get.ts'
import update from '../../server/api/products/[id].put.ts'
import status from '../../server/api/products/[id].patch.ts'

const database = vi.hoisted(() => ({
  product: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}))
vi.mock('../../server/utils/admin-session.ts', () => ({ requireAdminSession: async () => {} }))
vi.mock('../../server/utils/prisma.ts', () => ({ getPrisma: () => database }))
const id = '9c324b81-4434-4e66-b57a-0eaac04b0806'
const product = {
  id,
  name: 'Pão teste',
  salePriceCents: 1000,
  unitCostCents: 800,
  active: true,
  createdAt: new Date('2026-10-15T12:00:00Z'),
  updatedAt: new Date('2026-10-15T12:00:00Z'),
}
const input = { name: product.name, salePriceCents: 1000, unitCostCents: 800 }
const server = createServer(
  toNodeListener(
    createApp().use(
      createRouter()
        .get('/api/products', list)
        .post('/api/products', create)
        .get('/api/products/:id', get)
        .put('/api/products/:id', update)
        .patch('/api/products/:id', status),
    ),
  ),
)
let base = ''
async function request(
  path = '',
  method = 'GET',
  body?: unknown,
  headers?: Record<string, string>,
) {
  return fetch(`${base}/api/products${path}`, {
    method,
    headers: { origin: base, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeAll(async () => {
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
  vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'true')
  vi.resetAllMocks()
  database.product.findMany.mockResolvedValue([product])
  database.product.count.mockResolvedValue(1)
  database.product.findUnique.mockResolvedValue(product)
  database.product.create.mockResolvedValue(product)
  database.product.update.mockResolvedValue({ ...product, active: false })
})

describe('API de produtos pelo HTTP real com persistência isolada', () => {
  it('lista com paginação, evidência de 20% e consulta individual', async () => {
    const response = await request('?status=active&page=2')
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(data.page, 2)
    assert.equal(data.total, 1)
    assert.equal(data.items[0].grossMarginPercent, 20)
    assert.equal(data.items[0].lowMargin.ruleId, 'LOW_MARGIN')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(database.product.findMany.mock.calls[0]?.[0].skip, 20)
    assert.equal((await request(`/${id}`)).status, 200)
  })
  it('cadastra e edita somente campos permitidos, preservando o cadastro ao desativar', async () => {
    assert.equal((await request('', 'POST', input)).status, 201)
    assert.deepEqual(database.product.create.mock.calls[0]?.[0], { data: input })
    assert.equal((await request(`/${id}`, 'PUT', input)).status, 200)
    assert.equal((await request(`/${id}`, 'PATCH', { active: false })).status, 200)
    assert.deepEqual(database.product.update.mock.calls[1]?.[0], {
      where: { id },
      data: { active: false },
    })
  })
  it('rejeita dados inválidos, id inválido, filtros e corpos excessivos antes do banco', async () => {
    for (const body of [{ ...input, unitCostCents: -1 }, { ...input, active: true }, null]) {
      assert.equal((await request('', 'POST', body)).status, 400)
    }
    assert.equal((await request('/x', 'PUT', input)).status, 400)
    assert.equal((await request(`/${id}`, 'PATCH', { active: 'false' })).status, 400)
    assert.equal((await request('?page=0')).status, 400)
    assert.equal((await request('', 'POST', { ...input, name: 'x'.repeat(5000) })).status, 413)
    assert.equal(database.product.create.mock.calls.length, 0)
  })
  it('rejeita JSON inválido e corpo chunked acima do limite', async () => {
    const malformed = await fetch(`${base}/api/products`, {
      method: 'POST',
      headers: { origin: base, 'content-type': 'application/json' },
      body: '{invalid',
    })
    assert.equal(malformed.status, 400)
    const chunked = await new Promise<number | undefined>((resolve, reject) => {
      const req = nodeRequest(
        `${base}/api/products`,
        { method: 'POST', headers: { origin: base, 'content-type': 'application/json' } },
        (response) => {
          response.resume()
          resolve(response.statusCode)
        },
      )
      req.on('error', reject)
      req.write('x'.repeat(4097))
      req.end()
    })
    assert.equal(chunked, 413)
  })
  it('retorna 404 para registros ausentes e oculta falhas internas de persistência', async () => {
    database.product.findUnique.mockResolvedValue(null)
    assert.equal((await request(`/${id}`)).status, 404)
    database.product.update.mockRejectedValue({ code: 'P2025' })
    assert.equal((await request(`/${id}`, 'PUT', input)).status, 404)
    database.product.create.mockRejectedValue(new Error('password=SECRETO database internals'))
    const response = await request('', 'POST', input)
    assert.equal(response.status, 503)
    assert.doesNotMatch(await response.text(), /SECRETO|internals|password/)
  })
  it('suprime aviso em inativos e representa preço zero sem divisão', async () => {
    database.product.findUnique.mockResolvedValue({ ...product, active: false, salePriceCents: 0 })
    const data = await (await request(`/${id}`)).json()
    assert.equal(data.lowMargin, null)
    assert.equal(data.grossMarginPercent, null)
  })
  it('recusa conexões externas mesmo com Host local e flag habilitada', () => {
    const socket = new Socket()
    Object.defineProperty(socket, 'remoteAddress', { value: '203.0.113.10' })
    const req = new IncomingMessage(socket)
    req.method = 'GET'
    req.url = '/api/products'
    req.headers.host = 'localhost'
    const event = createEvent(req, new ServerResponse(req))
    assert.throws(() => assertLocalAccess(event), { statusCode: 403 })
    socket.destroy()
  })
  it('falha fechado sem habilitação e rejeita origem, Host e proxy externos', async () => {
    vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'false')
    assert.equal((await request()).status, 403)
    vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'true')
    const rejectedHeaders: Record<string, string>[] = [
      { origin: 'https://evil.example' },
      { 'x-forwarded-for': '127.0.0.1' },
      { 'sec-fetch-site': 'cross-site' },
    ]
    for (const headers of rejectedHeaders) {
      assert.equal((await request('', 'POST', input, headers)).status, 403, JSON.stringify(headers))
    }
    const forbiddenHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = nodeRequest(
        `${base}/api/products`,
        {
          method: 'POST',
          headers: { host: 'evil.example', origin: base, 'content-type': 'application/json' },
        },
        (response) => {
          response.resume()
          resolve(response.statusCode)
        },
      )
      req.on('error', reject)
      req.end(JSON.stringify(input))
    })
    assert.equal(forbiddenHost, 403)
    assert.equal((await request('', 'POST', input, { origin: '' })).status, 403)
    assert.equal((await request('', 'POST', input, { 'content-type': 'text/plain' })).status, 415)
    assert.equal(database.product.create.mock.calls.length, 0)
  })
})
