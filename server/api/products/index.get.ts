import { assertAdminAccess } from '../../utils/admin-access.ts'
import { defineEventHandler, getQuery } from 'h3'
import { listProducts } from '../../services/products.ts'
import { parseProductQuery } from '../../validation/products.ts'

export default defineEventHandler(async (event) => {
  await assertAdminAccess(event)
  return listProducts(parseProductQuery(getQuery(event)))
})
