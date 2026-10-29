import { calculateGrossMarginPercent } from './metrics.ts'

/** Hipótese experimental do protótipo, ainda sem calibração com a comunidade. */
export const LOW_MARGIN_THRESHOLD_PERCENT = 25

export interface LowMarginInput {
  readonly productName: string
  readonly unitPriceCents: number
  readonly unitCostCents: number
}

export interface LowMarginSuggestion {
  readonly ruleId: 'LOW_MARGIN'
  readonly title: string
  readonly reason: string
  readonly evidence: {
    readonly productName: string
    readonly unitPriceCents: number
    readonly unitCostCents: number
    readonly grossMarginPercent: number
    readonly thresholdPercent: number
    readonly basis: 'registered-unit-values'
  }
  readonly action: string
  readonly limitations: readonly string[]
  readonly severity: 'warning'
}

/** Alerta demonstrativo sobre valores de cadastro; não comprova vendas no período. */
export function evaluateLowMargin(input: LowMarginInput): LowMarginSuggestion | null {
  const productName = input.productName.trim()
  if (productName.length === 0 || productName.length > 120) {
    throw new RangeError('O nome do produto deve ter entre 1 e 120 caracteres.')
  }

  const grossMarginPercent = calculateGrossMarginPercent(input.unitPriceCents, input.unitCostCents)
  if (grossMarginPercent === null || grossMarginPercent >= LOW_MARGIN_THRESHOLD_PERCENT) {
    return null
  }

  const formattedMargin = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(
    grossMarginPercent,
  )

  return {
    ruleId: 'LOW_MARGIN',
    title: `Atenção ao cadastro: margem bruta estimada baixa — ${productName}`,
    reason: `O preço e o custo unitário registrados resultam em margem bruta estimada de ${formattedMargin}%, abaixo do limiar experimental de ${LOW_MARGIN_THRESHOLD_PERCENT}%.`,
    evidence: {
      productName,
      unitPriceCents: input.unitPriceCents,
      unitCostCents: input.unitCostCents,
      grossMarginPercent,
      thresholdPercent: LOW_MARGIN_THRESHOLD_PERCENT,
      basis: 'registered-unit-values',
    },
    action: 'Revisar a composição do custo unitário e o preço de venda antes de tomar uma decisão.',
    limitations: [
      'Este cálculo não representa lucro líquido; não inclui tributos nem despesas indiretas não registradas no custo unitário.',
      'Sem evidência de vendas no período: este é um aviso de cadastro, não uma oportunidade de resultado comprovada.',
      `O limiar de ${LOW_MARGIN_THRESHOLD_PERCENT}% é uma configuração experimental, sem validação setorial; a ação não garante melhoria de resultados.`,
    ],
    severity: 'warning',
  }
}
