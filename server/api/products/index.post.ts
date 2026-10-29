import { assertAdminAccess } from '../../utils/admin-access.ts'
import { defineEventHandler, setResponseStatus } from 'h3'
import { createProduct } from '../../services/products.ts'
import { readJsonBody } from '../../utils/json-body.ts'
import { parseProductInput } from '../../validation/products.ts'

export default defineEventHandler(async (event) => {
  await assertAdminAccess(event)
  const input = parseProductInput(await readJsonBody(event))
  const product = await createProduct(input)
  setResponseStatus(event, 201)
  return product
})
