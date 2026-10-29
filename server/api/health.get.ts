import { createError, defineEventHandler } from 'h3'
import { assertLocalAccess } from '../utils/local-access.ts'
import { databaseReady } from '../utils/health.ts'

export default defineEventHandler(async (event) => {
  assertLocalAccess(event)
  if (!(await databaseReady())) {
    throw createError({ statusCode: 503, message: 'Serviço indisponível.' })
  }
  return { status: 'ok' as const }
})
