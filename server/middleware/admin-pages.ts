import { createError, defineEventHandler, getRequestURL, sendRedirect } from 'h3'
import { configuredPasswordHash } from '../utils/admin-account.ts'
import { sessionStatus } from '../utils/admin-session.ts'
import { assertLocalAccess } from '../utils/local-access.ts'

/** Redireciona antes do SSR; não depende da proteção visual para autorizar APIs. */
export default defineEventHandler(async (event) => {
  const path =
    getRequestURL(event, { xForwardedHost: false, xForwardedProto: false }).pathname.replace(
      /\/+$/,
      '',
    ) || '/'
  if (path === '/configurar-conta') {
    assertLocalAccess(event)
    if (await configuredPasswordHash()) {
      return sendRedirect(event, '/entrar', 302)
    }
    return
  }
  if (path === '/entrar') {
    try {
      assertLocalAccess(event)
      if (!(await configuredPasswordHash())) {
        return sendRedirect(event, '/configurar-conta', 302)
      }
    } catch {
      // A entrada continua pública e orienta falhas de configuração/indisponibilidade.
    }
    return
  }
  if (path.startsWith('/api/') || path.startsWith('/_nuxt/')) {
    return
  }
  if (!['/', '/sugestoes', '/produtos', '/registros', '/minha-conta'].includes(path)) {
    throw createError({ statusCode: 404, message: 'Recurso não encontrado.' })
  }
  assertLocalAccess(event)
  let authenticated = false
  try {
    authenticated = (await sessionStatus(event)).authenticated
  } catch {
    /* A tela de entrada orienta configuração/conexão sem renderizar a página privada. */
  }
  if (!authenticated) {
    return sendRedirect(event, '/entrar', 302)
  }
})
