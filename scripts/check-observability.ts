import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { localTestServer, object } from './local-test-server.ts'

const server = localTestServer(3110)
let monitor: ChildProcess | undefined
let output = ''
async function waitFor(event: string): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (output.includes(`"event":"${event}"`)) {
      return
    }
    if (monitor?.exitCode !== null) {
      throw new Error('Monitor encerrou antes de verificar o cenário.')
    }
    await setTimeout(100)
  }
  throw new Error(`Monitor não registrou ${event} no prazo esperado.`)
}
try {
  await server.start(true, false)
  const health = await fetch(`${server.base}/api/health`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok' })
  const requestId = health.headers.get('x-request-id')
  assert.match(requestId ?? '', /^[a-f0-9-]{36}$/)
  const denied = await fetch(`${server.base}/api/products?token=CANARY_PRIVATE`, {
    headers: { cookie: 'CANARY_PRIVATE', 'x-request-id': 'CANARY_PRIVATE' },
  })
  assert.equal(denied.status, 401)
  assert.doesNotMatch(await denied.text(), /CANARY_PRIVATE|url|stack/)
  assert.equal((await fetch(`${server.base}/`, { redirect: 'manual' })).status, 302)
  assert.equal((await fetch(`${server.base}/entrar`)).status, 200)
  const missing = await fetch(`${server.base}/api/unknown-CANARY_PRIVATE?token=CANARY_PRIVATE`)
  assert.equal(missing.status, 404)
  const missingBody = object(await missing.json())
  assert.equal(missingBody.requestId, missing.headers.get('x-request-id'))
  assert.doesNotMatch(JSON.stringify(missingBody), /CANARY_PRIVATE|url|stack/)
  for (const path of [
    '/CANARY_PRIVATE?token=CANARY_PRIVATE',
    '/_nuxt/CANARY_PRIVATE.js?token=CANARY_PRIVATE',
  ]) {
    const response = await fetch(`${server.base}${path}`)
    assert.equal(response.status, 404)
    assert.doesNotMatch(await response.text(), /CANARY_PRIVATE|url|stack/)
  }
  monitor = spawn(
    process.execPath,
    ['scripts/monitor-health.ts', '--origin', server.base, '--interval', '200', '--threshold', '3'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  monitor.stdout?.on('data', (data: Buffer) => {
    output += data.toString()
  })
  monitor.stderr?.on('data', (data: Buffer) => {
    output += data.toString()
  })
  await waitFor('health.sample')
  await server.stop()
  await waitFor('health.alert')
  await server.start(true, false)
  await waitFor('health.recovered')
  const monitorClosed = once(monitor, 'exit')
  monitor.kill('SIGTERM')
  await monitorClosed
  // Uma conexão TCP local indisponível comprova 503 real sem parar o PostgreSQL principal.
  await server.stop()
  const unavailableDatabase = new URL(process.env.DATABASE_URL ?? '')
  unavailableDatabase.port = '1'
  await server.start(true, false, unavailableDatabase.toString())
  const unhealthy = await fetch(`${server.base}/api/health?token=CANARY_PRIVATE`, {
    signal: AbortSignal.timeout(8000),
  })
  assert.equal(unhealthy.status, 503)
  assert.doesNotMatch(await unhealthy.text(), /CANARY_PRIVATE|postgresql|password|url|stack/)
  await setTimeout(200)
  assert.doesNotMatch(
    output + server.output(),
    /CANARY_PRIVATE|scrypt:|postgresql:\/\/|SQL privado/,
  )
  const logs = server
    .output()
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => object(JSON.parse(line)))
  assert.ok(
    logs.some(
      (log) => log.requestId === requestId && log.statusCode === 200 && log.resource === 'health',
    ),
  )
  assert.ok(
    logs.some(
      (log) => log.statusCode === 401 && log.resource === 'products' && log.level === 'warn',
    ),
  )
  assert.ok(
    logs.some(
      (log) => log.statusCode === 503 && log.resource === 'health' && log.level === 'error',
    ),
  )
  const events = output
    .trim()
    .split('\n')
    .map((line) => object(JSON.parse(line)))
  await mkdir('.local/reports', { recursive: true, mode: 0o700 })
  await writeFile(
    '.local/reports/observability.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        healthStatus: 200,
        databaseUnavailableStatus: 503,
        unauthenticatedStatus: 401,
        privatePageStatus: 302,
        loginPageStatus: 200,
        events,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )
  console.log(
    'PASS: HTTP/login, health com PostgreSQL real e 503 para banco indisponível, correlação e logs sem canários privados; monitor em processo separado detectou parada, emitiu alerta após três falhas e registrou recuperação após reinício.',
  )
} finally {
  if (monitor && monitor.exitCode === null && monitor.signalCode === null) {
    const closed = once(monitor, 'exit')
    monitor.kill('SIGTERM')
    await closed
  }
  await server.cleanup()
}
