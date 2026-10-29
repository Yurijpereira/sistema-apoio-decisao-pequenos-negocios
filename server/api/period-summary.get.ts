import { defineEventHandler, getQuery } from 'h3'
import { assertAdminAccess } from '../utils/admin-access.ts'
import { getPeriodSummary } from '../services/operations.ts'
import { parsePeriodQuery } from '../validation/operations.ts'

export default defineEventHandler(async (event) => {
  await assertAdminAccess(event)
  return getPeriodSummary(parsePeriodQuery(getQuery(event)))
})
