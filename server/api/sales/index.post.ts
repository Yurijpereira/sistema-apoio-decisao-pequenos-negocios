import { defineEventHandler, setResponseStatus } from 'h3'
import { assertLocalAccess } from '../../utils/local-access.ts'
import { readJsonBody } from '../../utils/json-body.ts'
import { saveSale } from '../../services/operations.ts'
import { parseSaleInput } from '../../validation/operations.ts'

export default defineEventHandler(async (event) => {
  assertLocalAccess(event)
  const record = await saveSale(parseSaleInput(await readJsonBody(event)))
  setResponseStatus(event, 201)
  return record
})
