import type { PeriodSummary } from './operations.ts'

export interface DatePeriod {
  from: string
  to: string
}
export interface SuggestionQuery {
  to: string
  recordsComplete: boolean
}
export interface DecisionTotals {
  revenueCents: number
  costCents: number
  quantity: number
  saleCount: number
  expenseCents: number
}
export interface ProductSales extends Omit<DecisionTotals, 'expenseCents'> {
  productId: string
  productName: string
}
export interface CatalogPrice {
  productId: string
  productName: string
  unitPriceCents: number
  unitCostCents: number
}
export interface ExpenseCategory {
  category: string
  amountCents: number
}
export interface DecisionInput extends SuggestionQuery {
  asOfDate: string
  current: DecisionTotals
  previous: DecisionTotals
  products: ProductSales[]
  belowCostProducts: CatalogPrice[]
  topExpense: ExpenseCategory | null
}
export type RuleId = 'BELOW_COST' | 'LOW_MARGIN' | 'EXPENSE_PRESSURE' | 'SALES_DROP'
interface SuggestionBase {
  key: string
  title: string
  reason: string
  action: string
  limitations: string[]
}
interface HistoricalEvidence extends ProductSales {
  basis: 'historical-sales'
  grossMarginPercent: number | null
  thresholdPercent: number
  minimumSales: number
}
interface ExpenseEvidence {
  basis: 'period-expenses'
  revenueCents: number
  expenseCents: number
  expenseRevenuePercent: number
  thresholdPercent: number
  topExpense: ExpenseCategory
}
interface ComparisonEvidence {
  basis: 'comparable-periods'
  revenueCents: number
  previousRevenueCents: number
  saleCount: number
  previousSaleCount: number
  revenueChangePercent: number
  thresholdPercent: number
  minimumSales: number
  minimumPreviousRevenueCents: number
}
export type Suggestion = SuggestionBase &
  (
    | {
        ruleId: 'BELOW_COST'
        severity: 'high'
        period: null
        evidence: CatalogPrice & { basis: 'current-catalog'; grossMarginPercent: number | null }
      }
    | {
        ruleId: 'LOW_MARGIN'
        severity: 'warning'
        period: DatePeriod
        evidence: HistoricalEvidence
      }
    | {
        ruleId: 'EXPENSE_PRESSURE'
        severity: 'warning'
        period: DatePeriod
        evidence: ExpenseEvidence
      }
    | {
        ruleId: 'SALES_DROP'
        severity: 'warning'
        period: DatePeriod
        previousPeriod: DatePeriod
        evidence: ComparisonEvidence
      }
  )
export interface SuggestionReport {
  summary: PeriodSummary
  asOfDate: string
  period: DatePeriod
  previousPeriod: DatePeriod
  recordsComplete: boolean
  suggestions: Suggestion[]
  notices: string[]
}
