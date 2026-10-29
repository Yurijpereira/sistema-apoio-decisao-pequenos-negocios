import { parseArgs } from 'node:util'
import { setTimeout } from 'node:timers/promises'
import { healthTarget, monitorStep, probeHealth, type MonitorState } from './monitoring.ts'

try {
  const { values } = parseArgs({
    options: {
      origin: { type: 'string', default: 'http://127.0.0.1:3000' },
      interval: { type: 'string', default: '30000' },
      count: { type: 'string', default: '0' },
      threshold: { type: 'string', default: '3' },
    },
  })
  const url = healthTarget(values.origin)
  const interval = Number(values.interval),
    count = Number(values.count),
    threshold = Number(values.threshold)
  if (
    !Number.isSafeInteger(interval) ||
    interval < 100 ||
    interval > 3600000 ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > 1000000 ||
    !Number.isSafeInteger(threshold) ||
    threshold < 1 ||
    threshold > 100
  ) {
    throw new Error('Parâmetros inválidos.')
  }
  let state: MonitorState = { failures: 0, alerted: false }
  let healthy = false
  for (let index = 0; count === 0 || index < count; index++) {
    const started = performance.now()
    healthy = await probeHealth(url)
    const next = monitorStep(state, healthy, threshold)
    state = next.state
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: next.event,
        level: next.event === 'health.alert' ? 'error' : 'info',
        status: healthy ? 'available' : 'unavailable',
        failures: state.failures,
        durationMs: Math.round(performance.now() - started),
      }),
    )
    if (count === 0 || index + 1 < count) {
      await setTimeout(interval)
    }
  }
  if (!healthy) {
    process.exitCode = 1
  }
} catch {
  console.error(
    'Monitor não iniciado: confira origem local e parâmetros. Nenhum detalhe privado foi registrado.',
  )
  process.exitCode = 1
}
