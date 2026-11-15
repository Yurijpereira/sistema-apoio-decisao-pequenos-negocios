import type {
  AnalysisStatus,
  DecisionInput,
  RuleAnalysis,
  Suggestion,
} from '../../shared/types/suggestions.ts'
import { formatCents } from '../../shared/utils/money.ts'
import {
  EXPENSE_PRESSURE_PERCENT,
  MINIMUM_PREVIOUS_REVENUE_CENTS,
  MINIMUM_SALES,
  SALES_DROP_PERCENT,
} from './period-rules.ts'
import { LOW_MARGIN_THRESHOLD_PERCENT } from './rules.ts'

const definitions = [
  { ruleId: 'LOW_MARGIN', title: 'Margem bruta estimada dos produtos' },
  { ruleId: 'EXPENSE_PRESSURE', title: 'Peso das despesas na receita' },
  { ruleId: 'SALES_DROP', title: 'Comparação de receita entre semanas' },
] as const

/** Classifica a execução das regras sem criar novos gatilhos ou inferir completude. */
export function assessAnalyses(
  input: DecisionInput,
  suggestions: readonly Suggestion[],
): RuleAnalysis[] {
  function item(index: 0 | 1 | 2, status: AnalysisStatus, reason: string): RuleAnalysis {
    return { ...definitions[index], status, reason }
  }
  if (input.to >= input.asOfDate) {
    return definitions.map((definition) => ({
      ...definition,
      status: 'open-period',
      reason:
        'A semana selecionada ainda está aberta ou é futura. Escolha uma data final anterior ao dia de referência do servidor.',
    }))
  }
  if (!input.recordsComplete) {
    return definitions.map((definition) => ({
      ...definition,
      status: 'confirmation-required',
      reason:
        'Confira as vendas e despesas das duas semanas, confirme que os registros estão completos e comparáveis e atualize a análise.',
    }))
  }
  const hasAlert = (ruleId: RuleAnalysis['ruleId']): boolean =>
    suggestions.some((suggestion) => suggestion.ruleId === ruleId)
  const eligibleProducts = input.products.filter(
    (product) => product.saleCount >= MINIMUM_SALES && product.revenueCents > 0,
  ).length
  const missingProducts = input.products.length - eligibleProducts
  const lowMarginCount = suggestions.filter(
    (suggestion) => suggestion.ruleId === 'LOW_MARGIN',
  ).length
  const missingNote =
    missingProducts > 0
      ? ` ${missingProducts} produto(s) sem base suficiente; eles não foram avaliados.`
      : ''
  let margin: RuleAnalysis
  if (eligibleProducts === 0) {
    margin = item(
      0,
      'insufficient-data',
      `Nenhum produto tem base suficiente. São necessários receita positiva e pelo menos ${MINIMUM_SALES} registros de venda por produto na semana. Confira os lançamentos.`,
    )
  } else if (lowMarginCount > 0) {
    margin = item(
      0,
      'attention',
      `${lowMarginCount} produto(s) com margem abaixo de ${LOW_MARGIN_THRESHOLD_PERCENT}% entre ${eligibleProducts} avaliado(s).${missingNote}`,
    )
  } else if (missingProducts > 0) {
    margin = item(
      0,
      'partial',
      `${eligibleProducts} produto(s) avaliado(s) sem margem abaixo de ${LOW_MARGIN_THRESHOLD_PERCENT}%. ${missingProducts} produto(s) sem base suficiente; confira suas vendas antes de concluir sobre todos os produtos.`,
    )
  } else {
    margin = item(
      0,
      'no-alert',
      `Nenhum dos ${eligibleProducts} produto(s) avaliado(s) apresentou margem abaixo do limiar experimental de ${LOW_MARGIN_THRESHOLD_PERCENT}%.`,
    )
  }
  let expenses: RuleAnalysis
  if (input.current.revenueCents === 0 || input.current.saleCount === 0) {
    expenses = item(
      1,
      'insufficient-data',
      'Não há vendas com receita positiva na semana para comparar com as despesas. Confira os lançamentos de vendas.',
    )
  } else if (!input.topExpense) {
    expenses = item(
      1,
      'insufficient-data',
      'Sem despesas registradas na semana. Confira os lançamentos; a ausência de registros não comprova ausência de despesas.',
    )
  } else {
    expenses = hasAlert('EXPENSE_PRESSURE')
      ? item(
          1,
          'attention',
          `As despesas atingiram pelo menos ${EXPENSE_PRESSURE_PERCENT}% da receita. Confira os valores e a categoria de maior gasto no cartão abaixo.`,
        )
      : item(
          1,
          'no-alert',
          `As despesas ficaram abaixo do limiar experimental de ${EXPENSE_PRESSURE_PERCENT}% da receita. Isso não mede o crescimento das despesas entre semanas.`,
        )
  }
  let revenue: RuleAnalysis
  if (input.current.saleCount < MINIMUM_SALES || input.previous.saleCount < MINIMUM_SALES) {
    revenue = item(
      2,
      'insufficient-data',
      `Há ${input.current.saleCount} registro(s) de venda na semana selecionada e ${input.previous.saleCount} na anterior. São necessários pelo menos ${MINIMUM_SALES} em cada semana. Confira os lançamentos.`,
    )
  } else if (input.previous.revenueCents < MINIMUM_PREVIOUS_REVENUE_CENTS) {
    revenue = item(
      2,
      'insufficient-data',
      `A receita anterior precisa atingir a base mínima experimental de ${formatCents(MINIMUM_PREVIOUS_REVENUE_CENTS)}. A base atual é insuficiente para esta comparação.`,
    )
  } else {
    revenue = hasAlert('SALES_DROP')
      ? item(
          2,
          'attention',
          `A receita caiu pelo menos ${SALES_DROP_PERCENT}% em relação à semana anterior. Confira a comparação no cartão abaixo antes de investigar possíveis causas.`,
        )
      : item(
          2,
          'no-alert',
          `A receita não apresentou queda de ${SALES_DROP_PERCENT}% ou mais entre as duas semanas, pelo critério experimental adotado.`,
        )
  }
  return [margin, expenses, revenue]
}
