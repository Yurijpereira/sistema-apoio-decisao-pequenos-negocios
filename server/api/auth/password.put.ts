import { defineEventHandler } from 'h3'
import { assertAdminAccess } from '../../utils/admin-access.ts'
import { readJsonBody } from '../../utils/json-body.ts'
import { objectWithKeys } from '../../validation/common.ts'
import { changeAdminPassword } from '../../services/admin-password.ts'

export default defineEventHandler(async (event) => {
  await assertAdminAccess(event)
  const input = objectWithKeys(await readJsonBody(event), [
    'currentPassword',
    'password',
    'confirmation',
  ])
  return changeAdminPassword(event, input)
})
