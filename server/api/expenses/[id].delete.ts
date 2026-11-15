import { defineEventHandler, getRouterParam, sendNoContent } from 'h3'
import { assertLocalAccess } from '../../utils/local-access.ts'
import { deleteExpense } from '../../services/operations.ts'
import { parseId } from '../../validation/common.ts'

export default defineEventHandler(async (event) => {
  assertLocalAccess(event)
  await deleteExpense(parseId(getRouterParam(event, 'id')))
  return sendNoContent(event)
})
