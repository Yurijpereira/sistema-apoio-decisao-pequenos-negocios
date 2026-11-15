import { createError, defineEventHandler, getRequestURL } from 'h3'
import { assertLocalAccess } from '../utils/local-access.ts'

/** Protege o acesso antes do SSR; cada API também valida o acesso local. */
export default defineEventHandler((event) => {
  const path =
    getRequestURL(event, { xForwardedHost: false, xForwardedProto: false }).pathname.replace(
      /\/+$/,
      '',
    ) || '/'
  if (path.startsWith('/api/') || path.startsWith('/_nuxt/')) {
    return
  }
  if (!['/', '/sugestoes', '/produtos', '/registros'].includes(path)) {
    throw createError({ statusCode: 404, message: 'Recurso não encontrado.' })
  }
  assertLocalAccess(event)
})
