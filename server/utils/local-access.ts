import { createError, getHeader, getRequestURL, setHeader, type H3Event } from 'h3'

/** Acesso direto de loopback, opt-in. Não equivale a autenticação de produção. */
export function assertLocalAccess(event: H3Event): void {
  setHeader(event, 'Cache-Control', 'no-store')
  const remote = event.node.req.socket.remoteAddress
  const url = getRequestURL(event, { xForwardedHost: false, xForwardedProto: false })
  if (
    process.env.LOCAL_PRODUCTS_ENABLED !== 'true' ||
    !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote ?? '') ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    getHeader(event, 'forwarded') !== undefined ||
    Object.keys(event.node.req.headers).some((header) => header.startsWith('x-forwarded-')) ||
    getHeader(event, 'sec-fetch-site') === 'cross-site'
  ) {
    throw createError({
      statusCode: 403,
      message: 'O registro está disponível somente no ambiente local habilitado.',
    })
  }

  if (event.method !== 'GET' && event.method !== 'HEAD') {
    if (getHeader(event, 'origin') !== url.origin) {
      throw createError({ statusCode: 403, message: 'Origem da solicitação não autorizada.' })
    }
    if (
      getHeader(event, 'content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
    ) {
      throw createError({ statusCode: 415, message: 'Envie dados em JSON.' })
    }
  }
}
