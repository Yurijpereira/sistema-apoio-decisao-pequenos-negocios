import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { analyzeSuggestions } from '../../server/decision/suggestions.ts'
import { comparisonInput, comparisonReport } from './comparison-support'
import {
  captureAnalysis,
  compareAnalyses,
  parseAnalysisReference,
  REFERENCE_MAX_AGE,
} from '../../app/utils/analysis-comparison'

const now = Date.parse('2026-10-15T12:00:00Z')
describe('comparação temporária de consultas da mesma semana', () => {
  it('captura cópia independente e valida a referência serializada', () => {
    const report = comparisonReport()
    const before = captureAnalysis(report, now)
    assert.ok(before)
    assert.deepEqual(parseAnalysisReference(JSON.stringify(before), now), before)
    report.summary.revenueCents = 1
    assert.equal(before.summary.revenueCents, 75000)
    assert.equal(before.previousSummary.revenueCents, 100000)
  })
  it('compara valores e sugestões removidas depois de corrigir uma despesa', () => {
    const before = captureAnalysis(comparisonReport(), now)
    assert.ok(before)
    const input = comparisonInput()
    input.current.expenseCents = 30000
    input.topExpense = { category: 'DEMO · Energia', amountCents: 30000 }
    const after = captureAnalysis(analyzeSuggestions(input), now + 1000)
    assert.ok(after)
    const result = compareAnalyses(before, after)
    assert.ok(result?.changed)
    assert.equal(result.before.summary.expenseRevenuePercent, 65)
    assert.equal(result.after.summary.expenseRevenuePercent, 40)
    assert.deepEqual(
      result.removed.map((item) => item.ruleId),
      ['EXPENSE_PRESSURE'],
    )
    assert.equal(result.added.length, 0)
  })
  it('detecta alterações de evidência em sugestões mantidas e novos alertas', () => {
    const initial = comparisonReport()
    const before = captureAnalysis(initial, now)
    assert.ok(before)
    const input = comparisonInput()
    input.current.expenseCents = 50000
    input.topExpense = { category: 'DEMO · Energia', amountCents: 50000 }
    const after = captureAnalysis(analyzeSuggestions(input), now + 1000)
    assert.ok(after)
    const updated = compareAnalyses(before, after)
    assert.equal(updated?.updated[0]?.after.ruleId, 'EXPENSE_PRESSURE')
    const reversed = compareAnalyses(after, { ...before, capturedAt: now + 2000 })
    assert.ok(reversed?.changed)
    initial.suggestions = initial.suggestions.filter((item) => item.ruleId !== 'EXPENSE_PRESSURE')
    const without = captureAnalysis(initial, now)
    assert.ok(without)
    assert.deepEqual(
      compareAnalyses(without, after)?.added.map((item) => item.ruleId),
      ['EXPENSE_PRESSURE'],
    )
  })
  it('não transforma sugestão ausente por falta de dados em resolução', () => {
    const before = captureAnalysis(comparisonReport(), now)
    assert.ok(before)
    const input = comparisonInput()
    input.current.saleCount = 0
    input.current.revenueCents = 0
    input.products = []
    const after = captureAnalysis(analyzeSuggestions(input), now + 1000)
    assert.ok(after)
    const result = compareAnalyses(before, after)
    assert.ok(result)
    assert.ok(result.removed.some((item) => item.ruleId === 'SALES_DROP'))
    assert.equal(
      result.after.analyses.find((item) => item.ruleId === 'SALES_DROP')?.status,
      'insufficient-data',
    )
  })
  it('não compara períodos, referências de servidor ou relógios incompatíveis', () => {
    const before = captureAnalysis(comparisonReport(), now)
    assert.ok(before)
    assert.equal(compareAnalyses(before, { ...before, asOfDate: '2026-10-16' }), null)
    assert.equal(
      compareAnalyses(before, { ...before, period: { from: '2026-10-01', to: '2026-10-07' } }),
      null,
    )
    assert.equal(compareAnalyses(before, { ...before, capturedAt: now - 1 }), null)
    assert.equal(
      compareAnalyses(before, { ...before, capturedAt: now + REFERENCE_MAX_AGE + 1 }),
      null,
    )
    assert.equal(captureAnalysis({ ...comparisonReport(), recordsComplete: false }, now), null)
    assert.equal(captureAnalysis({ ...comparisonReport(), asOfDate: '2026-10-14' }, now), null)
  })
  it('detecta correção na semana anterior mesmo sem mudança nos indicadores atuais', () => {
    const before = captureAnalysis(comparisonReport(), now)
    assert.ok(before)
    const input = comparisonInput()
    input.previous.revenueCents = 140000
    const after = captureAnalysis(analyzeSuggestions(input), now + 1000)
    assert.ok(after)
    const comparison = compareAnalyses(before, after)
    assert.ok(comparison?.changed)
    assert.deepEqual(comparison.before.summary, comparison.after.summary)
    assert.equal(comparison.after.previousSummary.revenueCents, 140000)
    assert.ok(comparison.updated.some((item) => item.after.ruleId === 'SALES_DROP'))
  })
  it('descarta cache inválido, adulterado, excessivo, vencido ou de versão desconhecida', () => {
    const snapshot = captureAnalysis(comparisonReport(), now)
    assert.ok(snapshot)
    for (const raw of [
      null,
      '{invalid',
      '[]',
      JSON.stringify({ ...snapshot, version: 2 }),
      JSON.stringify({ ...snapshot, capturedAt: now + 1 }),
      JSON.stringify({ ...snapshot, summary: { ...snapshot.summary, revenueCents: -1 } }),
      JSON.stringify({ ...snapshot, analyses: [] }),
      JSON.stringify({
        ...snapshot,
        suggestions: [...snapshot.suggestions, ...snapshot.suggestions],
      }),
      'x'.repeat(500001),
    ]) {
      assert.equal(parseAnalysisReference(raw, now), null)
    }
    assert.equal(
      parseAnalysisReference(JSON.stringify(snapshot), now + REFERENCE_MAX_AGE + 1),
      null,
    )
    assert.equal(compareAnalyses(snapshot, { ...snapshot, capturedAt: now + 1 })?.changed, false)
  })
})
