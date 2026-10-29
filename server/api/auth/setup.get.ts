import { defineEventHandler } from 'h3'
import { assertLocalAccess } from '../../utils/local-access.ts'
import { configuredPasswordHash } from '../../utils/admin-account.ts'

export default defineEventHandler(async (event) => {
  assertLocalAccess(event)
  return { configured: Boolean(await configuredPasswordHash()) }
})
