import { defineEventHandler, getRouterParam } from 'h3'
import { assertAdminAccess } from '../../utils/admin-access.ts'
import { readJsonBody } from '../../utils/json-body.ts'
import { saveSale } from '../../services/operations.ts'
import { parseSaleInput } from '../../validation/operations.ts'
import { parseId } from '../../validation/common.ts'

export default defineEventHandler(async (event) => {
  await assertAdminAccess(event)
  const id = parseId(getRouterParam(event, 'id'))
  return saveSale(parseSaleInput(await readJsonBody(event)), id)
})
