import { assertLocalAccess } from '../../utils/local-access.ts'
import { defineEventHandler, getQuery } from 'h3'
import { listProducts } from '../../services/products.ts'
import { parseProductQuery } from '../../validation/products.ts'

export default defineEventHandler(async (event) => {
  assertLocalAccess(event)
  return listProducts(parseProductQuery(getQuery(event)))
})
