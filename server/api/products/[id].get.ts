import { assertLocalAccess } from '../../utils/local-access.ts'
import { defineEventHandler, getRouterParam } from 'h3'
import { getProduct } from '../../services/products.ts'
import { parseProductId } from '../../validation/products.ts'

export default defineEventHandler(async (event) => {
  assertLocalAccess(event)
  return getProduct(parseProductId(getRouterParam(event, 'id')))
})
