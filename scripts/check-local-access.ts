import assert from 'node:assert/strict'
import { request as nodeRequest } from 'node:http'
import { getPrisma } from '../server/utils/prisma.ts'
import { localTestServer } from './local-test-server.ts'

const server = localTestServer(3108)
const db = getPrisma()
const pages = ['/', '/sugestoes', '/produtos', '/registros']
const endpoints = [
  ['products', 'GET'],
  ['products', 'POST'],
  ['products/invalid', 'GET'],
  ['products/invalid', 'PUT'],
  ['products/invalid', 'PATCH'],
  ['sales', 'GET'],
  ['sales', 'POST'],
  ['sales/invalid', 'PUT'],
  ['expenses', 'GET'],
  ['expenses', 'POST'],
  ['expenses/invalid', 'PUT'],
  ['expenses/invalid', 'DELETE'],
  ['period-summary', 'GET'],
  ['suggestions', 'GET'],
] as const

const deniedHeaders: Record<string, string>[] = [
  { 'x-forwarded-for': '127.0.0.1' },
  { forwarded: 'for=127.0.0.1' },
  { 'sec-fetch-site': 'cross-site' },
]

async function request(path: string, method = 'GET', headers: Record<string, string> = {}) {
  const query =
    method === 'GET' && ['/api/sales', '/api/expenses', '/api/period-summary'].includes(path)
      ? '?from=2026-11-01&to=2026-11-10'
      : ''
  return fetch(`${server.base}${path}${query}`, {
    method,
    headers: { origin: server.base, 'content-type': 'application/json', ...headers },
    body: method === 'GET' ? undefined : '{}',
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  })
}
// O fetch normaliza Host; o cliente HTTP nativo exercita o cabeçalho real.
function externalHostStatus(path: string, method = 'GET'): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = nodeRequest(
      `${server.base}${path}`,
      {
        method,
        headers: {
          'content-length': method === 'GET' ? '0' : '2',
          host: 'external.example',
          origin: server.base,
          'content-type': 'application/json',
        },
      },
      (response) => {
        response.resume()
        resolve(response.statusCode)
      },
    )
    request.on('error', reject)
    request.setTimeout(10000, () => request.destroy(new Error('HTTP excedeu o prazo.')))
    request.end(method === 'GET' ? undefined : '{}')
  })
}

try {
  // Não herda credenciais do desenvolvedor nem provisiona contas no schema isolado.
  delete process.env.ADMIN_PASSWORD_HASH
  await server.start()
  for (const path of pages) {
    const response = await request(path)
    assert.equal(response.status, 200, path)
    assert.equal(response.headers.get('location'), null)
    assert.equal(response.headers.get('set-cookie'), null)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const html = await response.text()
    assert.match(html, /VisãoAtiva/)
    assert.doesNotMatch(html, /Minha conta|Sair da conta|type="password"/)
  }
  for (const [path, method] of endpoints) {
    const response = await request(`/api/${path}`, method)
    assert.equal(
      response.status,
      path.includes('invalid') || method !== 'GET' ? 400 : 200,
      `${method} ${path}`,
    )
    assert.equal(response.headers.get('set-cookie'), null)
    assert.equal(await externalHostStatus(`/api/${path}`, method), 403, path)
    for (const headers of deniedHeaders) {
      assert.equal(
        (await request(`/api/${path}`, method, headers)).status,
        403,
        `${method} ${path}`,
      )
    }
  }
  for (const path of pages) {
    assert.equal(await externalHostStatus(path), 403, path)
    for (const headers of deniedHeaders) {
      assert.equal((await request(path, 'GET', headers)).status, 403, path)
    }
  }
  assert.equal((await request('/api/products', 'POST', { origin: '' })).status, 403)
  assert.equal(
    (await request('/api/products', 'POST', { origin: 'https://external.example' })).status,
    403,
  )
  assert.equal(
    (await request('/api/products', 'POST', { 'content-type': 'text/plain' })).status,
    415,
  )
  for (const path of [
    '/entrar',
    '/configurar-conta',
    '/minha-conta',
    '/api/auth/session',
    '/api/auth/setup',
  ]) {
    assert.equal((await request(path)).status, 404, path)
  }
  for (const [path, method] of [
    ['login', 'POST'],
    ['logout', 'POST'],
    ['setup', 'POST'],
    ['password', 'PUT'],
  ]) {
    assert.ok(path && method)
    assert.equal((await request(`/api/auth/${path}`, method)).status, 404)
  }
  assert.equal(await db.adminAccount.count(), 0)
  assert.equal(await db.adminSession.count(), 0)
  assert.equal(await db.adminLoginLimit.count(), 0)
  await server.stop()
  await server.start(false)
  for (const path of pages) {
    assert.equal((await request(path)).status, 403, path)
  }
  for (const [path, method] of endpoints) {
    assert.equal((await request(`/api/${path}`, method)).status, 403, path)
  }
  console.log(
    'PASS: páginas e APIs sem login/cookie/conta; rotas de autenticação removidas; flag, Host, loopback, proxy, cross-site, Origin e JSON continuam protegidos; schema PostgreSQL isolado removido ao encerrar.',
  )
} finally {
  await server.cleanup()
}
