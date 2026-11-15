import type {
  DatePeriod,
  DecisionInput,
  Suggestion,
  SuggestionReport,
} from '../../shared/types/suggestions.ts'
import { assessAnalyses } from './analysis-status.ts'
import { calculateExpenseRevenuePercent, calculateGrossMarginPercent } from './metrics.ts'
import { parseCivilDate } from '../../shared/utils/dates.ts'
import { belowCost, expensePressure, historicalLowMargin, salesDrop } from './period-rules.ts'

function timestamp(value: string): number {
  if (!parseCivilDate(value)) {
    throw new RangeError('Data civil inválida.')
  }
  return Date.parse(`${value}T00:00:00Z`)
}

export function comparisonPeriods(to: string): { current: DatePeriod; previous: DatePeriod } {
  const end = timestamp(to)
  const day = (offset: number): string => {
    const result = new Date(end + offset * 86_400_000).toISOString().slice(0, 10)
    if (!parseCivilDate(result)) {
      throw new RangeError('O período deve caber entre os anos 0001 e 9999.')
    }
    return result
  }
  return { current: { from: day(-6), to }, previous: { from: day(-13), to: day(-7) } }
}

function integer(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Agregado inválido ou acima do limite seguro.')
  }
}
function text(value: string, max: number): void {
  if (!value.trim() || value.length > max || /\p{Cc}/u.test(value)) {
    throw new RangeError('Identificação inválida.')
  }
}

/** Entrada explícita e imutável na execução: sem banco, relógio implícito ou serviços externos. */
export function analyzeSuggestions(input: DecisionInput): SuggestionReport {
  const periods = comparisonPeriods(input.to)
  timestamp(input.asOfDate)
  for (const totals of [input.current, input.previous, ...input.products]) {
    integer(totals.revenueCents)
    integer(totals.costCents)
    integer(totals.quantity)
    integer(totals.saleCount)
  }
  integer(input.current.expenseCents)
  integer(input.previous.expenseCents)
  for (const product of [...input.products, ...input.belowCostProducts]) {
    text(product.productId, 120)
    text(product.productName, 120)
  }
  for (const product of input.belowCostProducts) {
    integer(product.unitPriceCents)
    integer(product.unitCostCents)
  }
  if (input.topExpense) {
    text(input.topExpense.category, 80)
    integer(input.topExpense.amountCents)
  }
  const suggestions: Suggestion[] = []
  const notices: string[] = []
  for (const product of input.belowCostProducts) {
    const suggestion = belowCost(product)
    if (suggestion) {
      suggestions.push(suggestion)
    }
  }
  if (input.to >= input.asOfDate) {
    notices.push(
      'Período ainda aberto ou futuro. Selecione uma data final anterior ao dia de referência para analisar vendas e despesas.',
    )
  }
  if (!input.recordsComplete) {
    notices.push(
      'Confirme que conferiu todos os registros dos dois períodos antes de gerar análises históricas. A passagem dos dias não comprova registros completos.',
    )
  }
  if (input.to < input.asOfDate && input.recordsComplete) {
    for (const product of input.products) {
      const suggestion = historicalLowMargin(product, periods.current)
      if (suggestion) {
        suggestions.push(suggestion)
      }
    }
    const pressure = expensePressure(input, periods.current)
    const drop = salesDrop(input, periods.current, periods.previous)
    if (pressure) {
      suggestions.push(pressure)
    }
    if (drop) {
      suggestions.push(drop)
    }
  }
  // IDs e ordem fixa evitam variações por ordem de retorno do banco ou nomes locais.
  const priority = { BELOW_COST: 0, LOW_MARGIN: 1, EXPENSE_PRESSURE: 2, SALES_DROP: 3 }
  suggestions.sort(
    (a, b) =>
      priority[a.ruleId] - priority[b.ruleId] || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  )
  const unique = [...new Map(suggestions.map((item) => [item.key, item])).values()]
  const analyses = assessAnalyses(input, unique)
  if (unique.length === 0 && analyses.every((analysis) => analysis.status === 'no-alert')) {
    notices.push(
      'Nenhum limiar experimental foi atingido. Isso não comprova saúde financeira ou lucro.',
    )
  }
  return {
    summary: {
      ...input.current,
      grossMarginPercent: calculateGrossMarginPercent(
        input.current.revenueCents,
        input.current.costCents,
      ),
      expenseRevenuePercent: calculateExpenseRevenuePercent(
        input.current.expenseCents,
        input.current.revenueCents,
      ),
    },
    asOfDate: input.asOfDate,
    period: periods.current,
    previousPeriod: periods.previous,
    recordsComplete: input.recordsComplete,
    suggestions: unique,
    analyses,
    notices,
  }
}
