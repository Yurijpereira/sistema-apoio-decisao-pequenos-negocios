import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, it, vi } from 'vitest'
import pages from '../../server/middleware/local-pages.ts'

const server = createServer(
  toNodeListener(
    createApp()
      .use(pages)
      .use(defineEventHandler(() => 'página')),
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
beforeEach(() => vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'true'))

describe('páginas locais sem autenticação', () => {
  it('permite todas as páginas sem cookie, credencial ou redirecionamento, inclusive barra final', async () => {
    for (const path of ['/', '/sugestoes', '/produtos/', '/registros']) {
      const response = await fetch(base + path, { redirect: 'manual' })
      assert.equal(response.status, 200)
      assert.equal(await response.text(), 'página')
      assert.equal(response.headers.get('set-cookie'), null)
      assert.equal(response.headers.get('location'), null)
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
  })
  it('bloqueia acesso desabilitado e proxy antes de renderizar', async () => {
    vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'false')
    assert.equal((await fetch(base)).status, 403)
    vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'true')
    assert.equal((await fetch(base, { headers: { forwarded: 'for=127.0.0.1' } })).status, 403)
  })
  it('remove páginas de conta e deixa APIs e estáticos para seus próprios handlers', async () => {
    for (const path of ['/entrar', '/minha-conta', '/configurar-conta', '/nao-existe']) {
      assert.equal((await fetch(base + path)).status, 404)
    }
    vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'false')
    for (const path of ['/api/products', '/_nuxt/example.js']) {
      assert.equal((await fetch(base + path)).status, 200)
    }
  })
})
