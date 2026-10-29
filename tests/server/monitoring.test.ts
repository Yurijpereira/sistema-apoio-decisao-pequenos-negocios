import assert from 'node:assert/strict'
import { afterEach, it, vi } from 'vitest'
import { healthTarget, monitorStep, probeHealth } from '../../scripts/monitoring.ts'

afterEach(() => vi.unstubAllGlobals())
it('monitor aceita apenas origem local sem redirecionar ou enviar credenciais', () => {
  assert.equal(healthTarget('http://127.0.0.1:3000').pathname, '/api/health')
  for (const value of [
    'https://example.com',
    'file:///tmp/test',
    'http://user:secret@localhost',
    'http://localhost/api/health',
    'http://localhost?token=secret',
  ]) {
    assert.throws(() => healthTarget(value))
  }
})
it('emite um alerta por incidente, recupera e volta a alertar em nova falha', () => {
  let state = { failures: 0, alerted: false }
  const events = [false, false, false, false, true, true, false, false, false].map((healthy) => {
    const next = monitorStep(state, healthy, 3)
    state = next.state
    return next.event
  })
  assert.deepEqual(events, [
    'health.sample',
    'health.sample',
    'health.alert',
    'health.sample',
    'health.recovered',
    'health.sample',
    'health.sample',
    'health.sample',
    'health.alert',
  ])
})
it('exige 200 e status ok, limita corpo, timeout e falha de rede', async () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  const url = healthTarget('http://localhost')
  const cases: [Response, boolean][] = [
    [Response.json({ status: 'ok' }), true],
    [Response.json({ status: 'down' }), false],
    [Response.json({ status: 'ok' }, { status: 503 }), false],
    [new Response('x'.repeat(1025), { headers: { 'content-type': 'application/json' } }), false],
    [new Response('[]', { headers: { 'content-type': 'text/html' } }), false],
  ]
  for (const [response, expected] of cases) {
    fetcher.mockResolvedValueOnce(response)
    assert.equal(await probeHealth(url), expected)
  }
  fetcher.mockRejectedValueOnce(new Error('segredo de conexão'))
  assert.equal(await probeHealth(url), false)
  assert.equal(fetcher.mock.calls[0]?.[1].redirect, 'error')
})
