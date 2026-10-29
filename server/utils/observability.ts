import { randomUUID } from 'node:crypto'
import { setHeader, type H3Event } from 'h3'

interface Observation {
  requestId: string
  startedAt: number
}
declare module 'h3' {
  interface H3EventContext {
    observation?: Observation
  }
}

function resource(path: string): string {
  const first = path.split('?')[0]?.split('/')[2]
  return first &&
    ['products', 'sales', 'expenses', 'suggestions', 'period-summary', 'auth', 'health'].includes(
      first,
    )
    ? first
    : path.startsWith('/api/')
      ? 'api.other'
      : 'page'
}
/** Campos fechados: nunca serializar Error, evento, URL, headers, body ou registros. */
export function observeRequest(event: H3Event): void {
  const observation = { requestId: randomUUID(), startedAt: performance.now() }
  event.context.observation = observation
  setHeader(event, 'X-Request-ID', observation.requestId)
  const category = resource(event.path)
  const method = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(event.method)
    ? event.method
    : 'OTHER'
  let completed = false
  const finish = (aborted: boolean): void => {
    if (completed) {
      return
    }
    completed = true
    const statusCode = aborted ? 499 : event.node.res.statusCode
    if (statusCode < 400 && !event.path.startsWith('/api/')) {
      return
    }
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: aborted ? 'http.aborted' : 'http.completed',
        level: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
        requestId: observation.requestId,
        resource: category,
        method,
        statusCode,
        durationMs: Math.max(0, Math.round(performance.now() - observation.startedAt)),
      }),
    )
  }
  event.node.res.once('finish', () => finish(false))
  event.node.res.once('close', () => finish(!event.node.res.writableFinished))
}
