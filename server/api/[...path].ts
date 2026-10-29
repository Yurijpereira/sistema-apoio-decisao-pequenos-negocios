import { createError, defineEventHandler } from 'h3'

/** Uma API desconhecida não deve cair no SSR e no logger de URLs do Vue Router. */
export default defineEventHandler(() => {
  throw createError({ statusCode: 404, message: 'Recurso não encontrado.' })
})
