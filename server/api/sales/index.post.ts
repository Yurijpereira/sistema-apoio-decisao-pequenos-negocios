import { defineEventHandler, setResponseStatus } from 'h3'
import { assertAdminAccess } from '../../utils/admin-access.ts'
import { readJsonBody } from '../../utils/json-body.ts'
import { saveSale } from '../../services/operations.ts'
import { parseSaleInput } from '../../validation/operations.ts'

export default defineEventHandler(async (event) => {
  await assertAdminAccess(event)
  const record = await saveSale(parseSaleInput(await readJsonBody(event)))
  setResponseStatus(event, 201)
  return record
})
