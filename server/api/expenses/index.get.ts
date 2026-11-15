import { defineEventHandler, getQuery } from 'h3'
import { assertLocalAccess } from '../../utils/local-access.ts'
import { listExpenses } from '../../services/operations.ts'
import { parsePeriodQuery } from '../../validation/operations.ts'

export default defineEventHandler(async (event) => {
  assertLocalAccess(event)
  return listExpenses(parsePeriodQuery(getQuery(event)))
})
