import { defineEventHandler, setResponseStatus } from 'h3'
import { assertLocalAccess } from '../../utils/local-access.ts'
import { readJsonBody } from '../../utils/json-body.ts'
import { objectWithKeys } from '../../validation/common.ts'
import { setupAdminAccount } from '../../utils/admin-account.ts'

export default defineEventHandler(async (event) => {
  assertLocalAccess(event)
  const input = objectWithKeys(await readJsonBody(event), ['password', 'confirmation'])
  const result = await setupAdminAccount(event, input.password, input.confirmation)
  setResponseStatus(event, 201)
  return result
})
