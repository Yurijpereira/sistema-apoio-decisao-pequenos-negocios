import { defineEventHandler, getRouterParam } from 'h3'
import { assertAdminAccess } from '../../utils/admin-access.ts'
import { readJsonBody } from '../../utils/json-body.ts'
import { saveExpense } from '../../services/operations.ts'
import { parseExpenseInput } from '../../validation/operations.ts'
import { parseId } from '../../validation/common.ts'

export default defineEventHandler(async (event) => {
  await assertAdminAccess(event)
  const id = parseId(getRouterParam(event, 'id'))
  return saveExpense(parseExpenseInput(await readJsonBody(event)), id)
})
