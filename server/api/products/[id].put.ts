import { assertAdminAccess } from '../../utils/admin-access.ts'
import { defineEventHandler, getRouterParam } from 'h3'
import { updateProduct } from '../../services/products.ts'
import { readJsonBody } from '../../utils/json-body.ts'
import { parseProductId, parseProductInput } from '../../validation/products.ts'

export default defineEventHandler(async (event) => {
  await assertAdminAccess(event)
  const id = parseProductId(getRouterParam(event, 'id'))
  return updateProduct(id, parseProductInput(await readJsonBody(event)))
})
