import type { DecisionInput, SuggestionReport } from '../../shared/types/suggestions.ts'
import { analyzeSuggestions } from '../../server/decision/suggestions.ts'

export function comparisonInput(): DecisionInput {
  return {
    asOfDate: '2026-10-15',
    to: '2026-10-14',
    recordsComplete: true,
    current: {
      revenueCents: 75000,
      costCents: 60000,
      expenseCents: 48750,
      quantity: 75,
      saleCount: 3,
    },
    previous: {
      revenueCents: 100000,
      costCents: 80000,
      expenseCents: 0,
      quantity: 100,
      saleCount: 3,
    },
    products: [
      {
        productId: 'pao',
        productName: 'DEMO · Pão fictício',
        revenueCents: 75000,
        costCents: 60000,
        quantity: 75,
        saleCount: 3,
      },
    ],
    belowCostProducts: [
      {
        productId: 'catalog',
        productName: 'DEMO · Cadastro fictício',
        unitPriceCents: 500,
        unitCostCents: 600,
      },
    ],
    topExpense: { category: 'DEMO · Energia', amountCents: 48750 },
  }
}
export function comparisonReport(): SuggestionReport {
  return analyzeSuggestions(comparisonInput())
}
