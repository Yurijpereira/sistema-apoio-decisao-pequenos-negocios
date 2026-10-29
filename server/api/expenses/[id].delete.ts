import { defineEventHandler, getRouterParam, sendNoContent } from 'h3'
import { assertAdminAccess } from '../../utils/admin-access.ts'
import { deleteExpense } from '../../services/operations.ts'
import { parseId } from '../../validation/common.ts'

export default defineEventHandler(async (event) => {
  await assertAdminAccess(event)
  await deleteExpense(parseId(getRouterParam(event, 'id')))
  return sendNoContent(event)
})
