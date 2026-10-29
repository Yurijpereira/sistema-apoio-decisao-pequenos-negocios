import type { LowMarginSuggestion } from '../../server/decision/rules.ts'

/** Limite de INTEGER do PostgreSQL: R$ 21.474.836,47 por unidade. */
export const MAX_PRODUCT_CENTS = 2_147_483_647
export const PRODUCT_PAGE_SIZE = 20

export interface ProductInput {
  name: string
  salePriceCents: number
  unitCostCents: number
}

export interface ProductView extends ProductInput {
  id: string
  active: boolean
  createdAt: string
  updatedAt: string
  grossMarginPercent: number | null
  lowMargin: LowMarginSuggestion | null
}

export type ProductStatus = 'all' | 'active' | 'inactive'

export interface ProductQuery {
  page: number
  status: ProductStatus
}

export interface ProductList {
  items: ProductView[]
  total: number
  page: number
  pageSize: number
}
