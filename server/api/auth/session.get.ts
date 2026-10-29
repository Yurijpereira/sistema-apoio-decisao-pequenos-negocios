import { defineEventHandler } from 'h3'
import { sessionStatus } from '../../utils/admin-session.ts'
import { assertLocalAccess } from '../../utils/local-access.ts'

export default defineEventHandler((event) => {
  assertLocalAccess(event)
  return sessionStatus(event)
})
