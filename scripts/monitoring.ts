export interface MonitorState {
  failures: number
  alerted: boolean
}
export type MonitorEvent = 'health.sample' | 'health.alert' | 'health.recovered'

export function healthTarget(value: string): URL {
  const url = new URL(value)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('Informe somente a origem HTTP(S) local, sem credenciais ou caminho.')
  }
  return new URL('/api/health', url)
}
export function monitorStep(
  state: MonitorState,
  healthy: boolean,
  threshold: number,
): { state: MonitorState; event: MonitorEvent } {
  if (healthy) {
    return {
      state: { failures: 0, alerted: false },
      event: state.alerted ? 'health.recovered' : 'health.sample',
    }
  }
  const failures = Math.min(state.failures + 1, threshold)
  const alerted = state.alerted || failures >= threshold
  return {
    state: { failures, alerted },
    event: !state.alerted && alerted ? 'health.alert' : 'health.sample',
  }
}

export async function probeHealth(url: URL, timeoutMs = 8000): Promise<boolean> {
  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    })
    const length = Number(response.headers.get('content-length'))
    if (
      response.status !== 200 ||
      length > 1024 ||
      !response.headers.get('content-type')?.startsWith('application/json')
    ) {
      await response.body?.cancel()
      return false
    }
    // A origem é a própria aplicação local; limitar também respostas sem Content-Length.
    const reader = response.body?.getReader()
    if (!reader) {
      return false
    }
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) {
          break
        }
        size += chunk.value.byteLength
        if (size > 1024) {
          await reader.cancel()
          return false
        }
        chunks.push(chunk.value)
      }
    } finally {
      reader.releaseLock()
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof body === 'object' && body !== null && 'status' in body && body.status === 'ok'
  } catch {
    return false
  }
}
