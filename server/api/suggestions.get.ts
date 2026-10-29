import { defineEventHandler, getQuery } from 'h3'
import { businessDate } from '../../shared/utils/dates.ts'
import { getSuggestions } from '../services/suggestions.ts'
import { assertAdminAccess } from '../utils/admin-access.ts'
import { parseSuggestionQuery } from '../validation/suggestions.ts'

export default defineEventHandler(async (event) => {
  await assertAdminAccess(event)
  const asOfDate = businessDate(new Date())
  return getSuggestions(parseSuggestionQuery(getQuery(event), asOfDate), asOfDate)
})
