import type { PeriodSummary } from '#shared/types/operations'
import type {
  AnalysisStatus,
  DatePeriod,
  RuleAnalysis,
  RuleId,
  Suggestion,
  SuggestionReport,
} from '#shared/types/suggestions'
import { parseCivilDate } from '#shared/utils/dates'
import { formatCents } from '#shared/utils/money'
import { recordPeriod } from './analysis-context'

export const REFERENCE_STORAGE_KEY = 'visaoativa.analysis-reference.v1'
export const REFERENCE_MAX_AGE = 2 * 60 * 60 * 1000
const MAX_REFERENCE_LENGTH = 500_000
export interface ReferenceSuggestion {
  key: string
  ruleId: RuleId
  title: string
  evidence: string
}
export interface AnalysisReference {
  version: 1
  capturedAt: number
  asOfDate: string
  period: DatePeriod
  previousPeriod: DatePeriod
  summary: PeriodSummary
  previousSummary: PeriodSummary
  analyses: Pick<RuleAnalysis, 'ruleId' | 'status'>[]
  suggestions: ReferenceSuggestion[]
}
export interface AnalysisComparison {
  before: AnalysisReference
  after: AnalysisReference
  added: ReferenceSuggestion[]
  removed: ReferenceSuggestion[]
  updated: { before: ReferenceSuggestion; after: ReferenceSuggestion }[]
  changed: boolean
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function isFinitePercent(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}
function isBoundedText(value: unknown, limit: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= limit &&
    Array.from(value).every(
      (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
    )
  )
}
function isRuleId(value: unknown): value is RuleId {
  return (
    value === 'LOW_MARGIN' ||
    value === 'BELOW_COST' ||
    value === 'EXPENSE_PRESSURE' ||
    value === 'SALES_DROP'
  )
}
function isComparableStatus(value: unknown): value is AnalysisStatus {
  return (
    value === 'attention' ||
    value === 'no-alert' ||
    value === 'partial' ||
    value === 'insufficient-data'
  )
}
function parseSummary(value: unknown): PeriodSummary | null {
  if (!isRecord(value)) {
    return null
  }
  const {
    revenueCents,
    costCents,
    quantity,
    saleCount,
    expenseCents,
    grossMarginPercent,
    expenseRevenuePercent,
  } = value
  if (
    !isNonNegativeInteger(revenueCents) ||
    !isNonNegativeInteger(costCents) ||
    !isNonNegativeInteger(quantity) ||
    !isNonNegativeInteger(saleCount) ||
    !isNonNegativeInteger(expenseCents) ||
    !isFinitePercent(grossMarginPercent) ||
    !isFinitePercent(expenseRevenuePercent) ||
    (grossMarginPercent !== null && grossMarginPercent > 100) ||
    (expenseRevenuePercent !== null && expenseRevenuePercent < 0)
  ) {
    return null
  }
  return {
    revenueCents,
    costCents,
    quantity,
    saleCount,
    expenseCents,
    grossMarginPercent,
    expenseRevenuePercent,
  }
}
function validateReference(value: unknown, now: number): AnalysisReference | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isNonNegativeInteger(value.capturedAt) ||
    value.capturedAt > now ||
    now - value.capturedAt > REFERENCE_MAX_AGE ||
    !Number.isFinite(new Date(value.capturedAt).getTime())
  ) {
    return null
  }
  const asOfDate = parseCivilDate(value.asOfDate)
  const period = isRecord(value.period) ? recordPeriod(value.period) : null
  const previousPeriod = isRecord(value.previousPeriod) ? recordPeriod(value.previousPeriod) : null
  const currentSummary = parseSummary(value.summary),
    previousSummary = parseSummary(value.previousSummary)
  if (
    !asOfDate ||
    !period ||
    !previousPeriod ||
    period.to >= asOfDate ||
    !currentSummary ||
    !previousSummary
  ) {
    return null
  }
  const day = 86_400_000
  const date = (input: string): number => Date.parse(`${input}T00:00:00Z`)
  if (
    date(period.to) - date(period.from) !== 6 * day ||
    date(previousPeriod.to) - date(previousPeriod.from) !== 6 * day ||
    date(period.from) - date(previousPeriod.to) !== day
  ) {
    return null
  }
  if (
    !Array.isArray(value.analyses) ||
    value.analyses.length !== 3 ||
    !Array.isArray(value.suggestions) ||
    value.suggestions.length > 202
  ) {
    return null
  }
  const analyses: AnalysisReference['analyses'] = []
  for (const item of value.analyses) {
    if (
      !isRecord(item) ||
      !isRuleId(item.ruleId) ||
      item.ruleId === 'BELOW_COST' ||
      !isComparableStatus(item.status) ||
      analyses.some((existing) => existing.ruleId === item.ruleId)
    ) {
      return null
    }
    analyses.push({ ruleId: item.ruleId, status: item.status })
  }
  const suggestions: ReferenceSuggestion[] = []
  for (const item of value.suggestions) {
    if (
      !isRecord(item) ||
      !isRuleId(item.ruleId) ||
      !isBoundedText(item.key, 160) ||
      !isBoundedText(item.title, 500) ||
      !isBoundedText(item.evidence, 2000) ||
      suggestions.some((existing) => existing.key === item.key)
    ) {
      return null
    }
    const validKey =
      item.ruleId === 'BELOW_COST' || item.ruleId === 'LOW_MARGIN'
        ? item.key.startsWith(`${item.ruleId}:`)
        : item.key === item.ruleId
    if (!validKey) {
      return null
    }
    suggestions.push({
      key: item.key,
      ruleId: item.ruleId,
      title: item.title,
      evidence: item.evidence,
    })
  }
  return {
    version: 1,
    capturedAt: value.capturedAt,
    asOfDate,
    period,
    previousPeriod,
    summary: currentSummary,
    previousSummary,
    analyses,
    suggestions,
  }
}
export function parseAnalysisReference(raw: string | null, now: number): AnalysisReference | null {
  if (!raw || raw.length > MAX_REFERENCE_LENGTH) {
    return null
  }
  try {
    const value: unknown = JSON.parse(raw)
    return validateReference(value, now)
  } catch {
    return null
  }
}
function evidenceText(suggestion: Suggestion): string {
  const evidence = suggestion.evidence
  const percentText = (value: number | null): string =>
    value === null
      ? 'indisponível'
      : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}%`
  if (evidence.basis === 'current-catalog') {
    return `Preço: ${formatCents(evidence.unitPriceCents)}; custo: ${formatCents(evidence.unitCostCents)}; margem bruta estimada: ${percentText(evidence.grossMarginPercent)}.`
  }
  if (evidence.basis === 'historical-sales') {
    return `Receita: ${formatCents(evidence.revenueCents)}; custo: ${formatCents(evidence.costCents)}; margem bruta estimada: ${percentText(evidence.grossMarginPercent)}; ${evidence.quantity} unidades em ${evidence.saleCount} registros de venda.`
  }
  if (evidence.basis === 'period-expenses') {
    return `Despesas: ${formatCents(evidence.expenseCents)}; receita: ${formatCents(evidence.revenueCents)}; relação: ${percentText(evidence.expenseRevenuePercent)}; maior categoria: ${evidence.topExpense.category} (${formatCents(evidence.topExpense.amountCents)}).`
  }
  return `Receita: ${formatCents(evidence.revenueCents)}; anterior: ${formatCents(evidence.previousRevenueCents)}; variação: ${percentText(evidence.revenueChangePercent)}; ${evidence.saleCount} registros atuais evidence ${evidence.previousSaleCount} anteriores.`
}
export function captureAnalysis(report: SuggestionReport, now: number): AnalysisReference | null {
  if (
    !report.recordsComplete ||
    report.analyses.some(
      (item) => item.status === 'confirmation-required' || item.status === 'open-period',
    )
  ) {
    return null
  }
  return validateReference(
    {
      version: 1,
      capturedAt: now,
      asOfDate: report.asOfDate,
      period: report.period,
      previousPeriod: report.previousPeriod,
      summary: report.summary,
      previousSummary: report.previousSummary,
      analyses: report.analyses.map(({ ruleId, status }) => ({ ruleId, status })),
      suggestions: report.suggestions.map((item) => ({
        key: item.key,
        ruleId: item.ruleId,
        title: item.title,
        evidence: evidenceText(item),
      })),
    },
    now,
  )
}
export function sameAnalysisContext(
  before: AnalysisReference,
  after: Pick<SuggestionReport, 'asOfDate' | 'period' | 'previousPeriod'>,
): boolean {
  return (
    before.asOfDate === after.asOfDate &&
    before.period.from === after.period.from &&
    before.period.to === after.period.to &&
    before.previousPeriod.from === after.previousPeriod.from &&
    before.previousPeriod.to === after.previousPeriod.to
  )
}
export function compareAnalyses(
  before: AnalysisReference,
  after: AnalysisReference,
): AnalysisComparison | null {
  if (
    !sameAnalysisContext(before, after) ||
    after.capturedAt < before.capturedAt ||
    after.capturedAt - before.capturedAt > REFERENCE_MAX_AGE
  ) {
    return null
  }
  const oldItems = new Map(before.suggestions.map((item) => [item.key, item]))
  const newItems = new Map(after.suggestions.map((item) => [item.key, item]))
  const added = after.suggestions.filter((item) => !oldItems.has(item.key))
  const removed = before.suggestions.filter((item) => !newItems.has(item.key))
  const updated: AnalysisComparison['updated'] = []
  for (const item of after.suggestions) {
    const old = oldItems.get(item.key)
    if (old && (old.evidence !== item.evidence || old.title !== item.title)) {
      updated.push({ before: old, after: item })
    }
  }
  const statesChanged = after.analyses.some(
    (item) => before.analyses.find((old) => old.ruleId === item.ruleId)?.status !== item.status,
  )
  const changed =
    added.length > 0 ||
    removed.length > 0 ||
    updated.length > 0 ||
    statesChanged ||
    JSON.stringify(before.summary) !== JSON.stringify(after.summary) ||
    JSON.stringify(before.previousSummary) !== JSON.stringify(after.previousSummary)
  return { before, after, added, removed, updated, changed }
}
