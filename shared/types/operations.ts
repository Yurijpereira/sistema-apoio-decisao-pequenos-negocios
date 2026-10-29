export const MAX_SALE_QUANTITY = 1_000_000
export const RECORD_PAGE_SIZE = 20

export interface SaleInput {
  productId: string
  date: string
  quantity: number
  unitPriceCents: number
  unitCostCents: number
}

export interface SaleView extends SaleInput {
  id: string
  productNameSnapshot: string
  createdAt: string
  updatedAt: string
  revenueCents: number
  costCents: number
  grossMarginPercent: number | null
}

export interface ExpenseInput {
  date: string
  category: string
  description: string | null
  amountCents: number
}

export interface ExpenseView extends ExpenseInput {
  id: string
  createdAt: string
  updatedAt: string
}

export interface PeriodQuery {
  from: string
  to: string
  page: number
}

export interface RecordList<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface PeriodSummary {
  revenueCents: number
  costCents: number
  quantity: number
  saleCount: number
  expenseCents: number
  grossMarginPercent: number | null
  expenseRevenuePercent: number | null
}
