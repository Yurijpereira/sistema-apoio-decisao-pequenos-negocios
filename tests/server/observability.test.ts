import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, it, vi } from 'vitest'
import observe from '../../server/middleware/00-observability.ts'
import health from '../../server/api/health.get.ts'
import errors from '../../server/error-handler.ts'
import unknownApi from '../../server/api/[...path].ts'
import pages from '../../server/middleware/admin-pages.ts'

const db = vi.hoisted(() => ({ $queryRaw: vi.fn(), adminAccount: { findUnique: vi.fn() } }))
vi.mock('../../server/utils/prisma.ts', () => ({ getPrisma: () => db }))
const messages: string[] = []
const server = createServer(
  toNodeListener(
    createApp({ onError: errors })
      .use(observe)
      .use(pages)
      .use(
        createRouter()
          .get('/api/health', health)
          .get(
            '/api/products/:id',
            defineEventHandler(() => {
              throw new Error('password=SEGREDO, SQL privado')
            }),
          )
          .get('/api/**', unknownApi),
      ),
  ),
)
let base = ''
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
  vi.restoreAllMocks()
  vi.resetAllMocks()
  messages.length = 0
  vi.spyOn(console, 'log').mockImplementation((value: unknown) => messages.push(String(value)))
  vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'true')
  vi.stubEnv('ADMIN_PASSWORD_HASH', `scrypt:131072:8:1:${'a'.repeat(32)}:${'b'.repeat(128)}`)
  db.$queryRaw.mockResolvedValue([{ ok: 1 }])
})

describe('saúde e observabilidade sem dados privados', () => {
  it('health faz leitura real de prontidão, sem autenticação ou detalhes de infraestrutura', async () => {
    const response = await fetch(`${base}/api/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok' })
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.match(response.headers.get('x-request-id') ?? '', /^[a-f0-9-]{36}$/)
    assert.equal(db.$queryRaw.mock.calls.length, 1)
  })
  it('responde 503 sem expor conexão, senha ou causa interna', async () => {
    db.$queryRaw.mockRejectedValue(new Error('password=SEGREDO postgres://privado'))
    const response = await fetch(`${base}/api/health?token=PRIVADO`)
    assert.equal(response.status, 503)
    assert.doesNotMatch(await response.text(), /SEGREDO|PRIVADO|postgres|token/)
    vi.stubEnv('ADMIN_PASSWORD_HASH', '')
    assert.equal((await fetch(`${base}/api/health`)).status, 503)
  })
  it('preserva restrições de loopback, flag e proxy antes da consulta de saúde', async () => {
    vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'false')
    assert.equal((await fetch(`${base}/api/health`)).status, 403)
    vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'true')
    assert.equal(
      (await fetch(`${base}/api/health`, { headers: { 'x-forwarded-for': '127.0.0.1' } })).status,
      403,
    )
    assert.equal(db.$queryRaw.mock.calls.length, 0)
  })
  it('registra erro/correlação sem URL, ID de negócio, cabeçalhos, input ou stack', async () => {
    const response = await fetch(`${base}/api/products/NOME-PRIVADO?password=PRIVADO`, {
      headers: { authorization: 'Bearer PRIVADO', 'x-request-id': 'PRIVADO' },
    })
    assert.equal(response.status, 500)
    const body = await response.text()
    assert.doesNotMatch(body, /SEGREDO|PRIVADO|SQL|stack|url/)
    assert.doesNotMatch(messages.join('\n'), /SEGREDO|PRIVADO|SQL|Bearer|password|NOME/)
    const parsed: unknown = JSON.parse(messages.at(-1) ?? '{}')
    assert.ok(parsed && typeof parsed === 'object' && !Array.isArray(parsed))
    const entry = Object.fromEntries(Object.entries(parsed))
    assert.equal(entry.level, 'error')
    assert.equal(entry.resource, 'products')
    assert.equal(entry.statusCode, 500)
    assert.equal(entry.requestId, response.headers.get('x-request-id'))
    assert.ok(typeof entry.durationMs === 'number' && entry.durationMs >= 0)
  })
  it('404 também omite query e corpo de erro arbitrário; estáticos bem-sucedidos não geram ruído', async () => {
    const response = await fetch(`${base}/nao-existe?token=PRIVADO`)
    assert.equal(response.status, 404)
    assert.doesNotMatch(await response.text(), /PRIVADO|token|nao-existe/)
    const api = await fetch(`${base}/api/nao-existe?token=PRIVADO`)
    assert.equal(api.status, 404)
    assert.doesNotMatch(await api.text(), /PRIVADO|token|nao-existe/)
  })
})
