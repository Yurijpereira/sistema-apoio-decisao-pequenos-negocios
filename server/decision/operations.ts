import type { PeriodSummary, SaleInput } from '../../shared/types/operations.ts'
import { calculateExpenseRevenuePercent, calculateGrossMarginPercent } from './metrics.ts'

export function saleAmounts(
  sale: Pick<SaleInput, 'quantity' | 'unitPriceCents' | 'unitCostCents'>,
): { revenueCents: number; costCents: number; grossMarginPercent: number | null } {
  const revenueCents = sale.quantity * sale.unitPriceCents
  const costCents = sale.quantity * sale.unitCostCents
  return {
    revenueCents,
    costCents,
    grossMarginPercent: calculateGrossMarginPercent(revenueCents, costCents),
  }
}

export interface PeriodTotals {
  revenueCents: string
  costCents: string
  quantity: string
  saleCount: string
  expenseCents: string
}

export function safeAggregateInteger(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new RangeError('Total inválido.')
  }
  const integer = BigInt(value)
  if (integer > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('O período excede o limite seguro de cálculo; reduza o intervalo.')
  }
  return Number(integer)
}

/** SUM do PostgreSQL chega como inteiro decimal textual, sem passar por float. */
export function summarizePeriod(totals: PeriodTotals): PeriodSummary {
  const revenueCents = safeAggregateInteger(totals.revenueCents)
  const costCents = safeAggregateInteger(totals.costCents)
  return {
    revenueCents,
    costCents,
    quantity: safeAggregateInteger(totals.quantity),
    saleCount: safeAggregateInteger(totals.saleCount),
    expenseCents: safeAggregateInteger(totals.expenseCents),
    grossMarginPercent: calculateGrossMarginPercent(revenueCents, costCents),
    expenseRevenuePercent: calculateExpenseRevenuePercent(
      safeAggregateInteger(totals.expenseCents),
      revenueCents,
    ),
  }
}
