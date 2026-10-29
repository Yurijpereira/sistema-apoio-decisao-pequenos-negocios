import { defineEventHandler } from 'h3'
import { signIn } from '../../utils/admin-session.ts'
import { readJsonBody } from '../../utils/json-body.ts'
import { assertLocalAccess } from '../../utils/local-access.ts'
import { objectWithKeys } from '../../validation/common.ts'

export default defineEventHandler(async (event) => {
  assertLocalAccess(event)
  const input = objectWithKeys(await readJsonBody(event), ['password'])
  return signIn(event, input.password)
})
