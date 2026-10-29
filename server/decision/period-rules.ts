import type {
  CatalogPrice,
  DatePeriod,
  DecisionInput,
  ProductSales,
  Suggestion,
} from '../../shared/types/suggestions.ts'
import {
  calculateExpenseRevenuePercent,
  calculateGrossMarginPercent,
  calculateRevenueChangePercent,
} from './metrics.ts'
import { LOW_MARGIN_THRESHOLD_PERCENT } from './rules.ts'

/** Hipóteses acadêmicas experimentais, ainda sem calibração com usuários. */
export const MINIMUM_SALES = 3
export const MINIMUM_PREVIOUS_REVENUE_CENTS = 10_000
export const EXPENSE_PRESSURE_PERCENT = 60
export const SALES_DROP_PERCENT = 20
const historicalLimitations = [
  'Os registros foram declarados completos pelo usuário; o sistema não comprova sua completude.',
  'A margem bruta estimada não representa lucro líquido e pode omitir tributos e despesas indiretas.',
]

export function belowCost(product: CatalogPrice): Suggestion | null {
  if (product.unitPriceCents > product.unitCostCents) {
    return null
  }
  return {
    key: `BELOW_COST:${product.productId}`,
    ruleId: 'BELOW_COST',
    severity: 'high',
    period: null,
    title: `Preço igual ou abaixo do custo — ${product.productName}`,
    reason:
      'O preço unitário atual do produto ativo é menor ou igual ao custo unitário cadastrado.',
    evidence: {
      basis: 'current-catalog',
      ...product,
      grossMarginPercent: calculateGrossMarginPercent(
        product.unitPriceCents,
        product.unitCostCents,
      ),
    },
    action: 'Confira a composição do custo e revise o preço de cadastro antes de novas vendas.',
    limitations: [
      'Aviso do cadastro atual, sem comprovação de vendas; não altera nem descreve preços de vendas antigas.',
      'Preço zero torna a margem indisponível. Não representa lucro líquido nem garante resultado.',
    ],
  }
}

export function historicalLowMargin(product: ProductSales, period: DatePeriod): Suggestion | null {
  if (product.saleCount < MINIMUM_SALES || product.revenueCents === 0) {
    return null
  }
  // Comparação inteira exata: não arredondar o percentual para decidir o gatilho.
  if (
    (BigInt(product.revenueCents) - BigInt(product.costCents)) * BigInt(100) >=
    BigInt(product.revenueCents) * BigInt(LOW_MARGIN_THRESHOLD_PERCENT)
  ) {
    return null
  }
  return {
    key: `LOW_MARGIN:${product.productId}`,
    ruleId: 'LOW_MARGIN',
    severity: 'warning',
    period,
    title: `Margem bruta estimada baixa nas vendas — ${product.productName}`,
    reason:
      'A margem ponderada pela receita das vendas registradas ficou abaixo do limiar experimental de 25%.',
    evidence: {
      basis: 'historical-sales',
      ...product,
      grossMarginPercent: calculateGrossMarginPercent(product.revenueCents, product.costCents),
      thresholdPercent: LOW_MARGIN_THRESHOLD_PERCENT,
      minimumSales: MINIMUM_SALES,
    },
    action:
      'Confira os preços e custos dessas operações e revise a composição de preço para vendas futuras.',
    limitations: [
      ...historicalLimitations,
      'Limiar de 25% e mínimo de três registros de venda são experimentais; não garantem representatividade.',
      'O nome exibido é o da venda mais recente no período; o cadastro atual não recalcula o histórico.',
    ],
  }
}

export function expensePressure(input: DecisionInput, period: DatePeriod): Suggestion | null {
  const { current, topExpense } = input
  if (current.revenueCents === 0 || current.saleCount === 0 || !topExpense) {
    return null
  }
  if (
    BigInt(current.expenseCents) * BigInt(100) <
    BigInt(current.revenueCents) * BigInt(EXPENSE_PRESSURE_PERCENT)
  ) {
    return null
  }
  const ratio = calculateExpenseRevenuePercent(current.expenseCents, current.revenueCents)
  if (ratio === null) {
    return null
  }
  return {
    key: 'EXPENSE_PRESSURE',
    ruleId: 'EXPENSE_PRESSURE',
    severity: 'warning',
    period,
    title: 'Despesas relevantes em relação à receita',
    reason:
      'As despesas registradas atingiram pelo menos 60% da receita do período. A categoria de maior valor está identificada nas evidências.',
    evidence: {
      basis: 'period-expenses',
      revenueCents: current.revenueCents,
      expenseCents: current.expenseCents,
      expenseRevenuePercent: ratio,
      thresholdPercent: EXPENSE_PRESSURE_PERCENT,
      topExpense,
    },
    action: `Revise os lançamentos e contratos da categoria ${topExpense.category} antes de decidir sobre ajustes.`,
    limitations: [
      ...historicalLimitations,
      'Limiar experimental de 60%. Despesas podem incluir valores já considerados no custo unitário: não são subtraídas para inferir lucro.',
      'Categoria é texto livre; variações de nome são grupos distintos. Empates usam ordem textual estável.',
    ],
  }
}

export function salesDrop(
  input: DecisionInput,
  period: DatePeriod,
  previousPeriod: DatePeriod,
): Suggestion | null {
  const { current, previous } = input
  if (
    current.saleCount < MINIMUM_SALES ||
    previous.saleCount < MINIMUM_SALES ||
    previous.revenueCents < MINIMUM_PREVIOUS_REVENUE_CENTS
  ) {
    return null
  }
  if (
    BigInt(current.revenueCents) * BigInt(100) >
    BigInt(previous.revenueCents) * BigInt(100 - SALES_DROP_PERCENT)
  ) {
    return null
  }
  // Intervalos inclusivos da aplicação tornam-se exclusivos somente neste cálculo.
  const exclusiveEnd = (to: string): string =>
    new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  const change = calculateRevenueChangePercent(
    {
      startDate: previousPeriod.from,
      endDate: exclusiveEnd(previousPeriod.to),
      revenueCents: previous.revenueCents,
    },
    {
      startDate: period.from,
      endDate: exclusiveEnd(period.to),
      revenueCents: current.revenueCents,
    },
    input.asOfDate,
  )
  if (change === null) {
    return null
  }
  return {
    key: 'SALES_DROP',
    ruleId: 'SALES_DROP',
    severity: 'warning',
    period,
    previousPeriod,
    title: 'Queda de receita entre duas semanas completas',
    reason:
      'A receita dos sete dias selecionados caiu pelo menos 20% em relação aos sete dias imediatamente anteriores.',
    evidence: {
      basis: 'comparable-periods',
      revenueCents: current.revenueCents,
      previousRevenueCents: previous.revenueCents,
      saleCount: current.saleCount,
      previousSaleCount: previous.saleCount,
      revenueChangePercent: change,
      thresholdPercent: SALES_DROP_PERCENT,
      minimumSales: MINIMUM_SALES,
      minimumPreviousRevenueCents: MINIMUM_PREVIOUS_REVENUE_CENTS,
    },
    action:
      'Confira os registros e investigue mudanças de demanda, preço e funcionamento com outras evidências antes de agir.',
    limitations: [
      'Comparação descritiva, sem identificar causa, desperdício ou sazonalidade; semanas com feriados ou horários diferentes podem não ser comparáveis.',
      'Os dois períodos foram declarados completos pelo usuário; a declaração não é uma auditoria dos dados.',
      'Queda de 20%, três vendas por semana e base anterior de R$ 100,00 são hipóteses experimentais. Ausência de registros não comprova ausência de vendas.',
    ],
  }
}
