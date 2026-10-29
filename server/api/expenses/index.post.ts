import { defineEventHandler, setResponseStatus } from 'h3'
import { assertAdminAccess } from '../../utils/admin-access.ts'
import { readJsonBody } from '../../utils/json-body.ts'
import { saveExpense } from '../../services/operations.ts'
import { parseExpenseInput } from '../../validation/operations.ts'

export default defineEventHandler(async (event) => {
  await assertAdminAccess(event)
  const record = await saveExpense(parseExpenseInput(await readJsonBody(event)))
  setResponseStatus(event, 201)
  return record
})
