import assert from 'node:assert/strict'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import AnalysisComparison from '../../app/components/AnalysisComparison.vue'
import Suggestions from '../../app/pages/sugestoes.vue'
import Products from '../../app/pages/produtos.vue'
import { analyzeSuggestions } from '../../server/decision/suggestions.ts'
import { comparisonInput, comparisonReport } from './comparison-support'
import {
  captureAnalysis,
  compareAnalyses,
  REFERENCE_STORAGE_KEY,
  REFERENCE_MAX_AGE,
} from '../../app/utils/analysis-comparison'

const now = Date.parse('2026-10-15T12:00:00Z')
function correctedReport() {
  const input = comparisonInput()
  input.current.expenseCents = 30000
  input.topExpense = { category: 'DEMO · Energia', amountCents: 30000 }
  return analyzeSuggestions(input)
}
function baseline() {
  const reference = captureAnalysis(comparisonReport(), now)
  assert.ok(reference)
  return reference
}
beforeEach(() => {
  sessionStorage.clear()
  vi.spyOn(Date, 'now').mockReturnValue(now + 1000)
  vi.stubGlobal('useRoute', () => ({ query: { to: '2026-10-14' } }))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('apresentação do antes e depois', () => {
  it('mostra valores, sugestão removida e descarte sem prometer resolução', async () => {
    const after = captureAnalysis(correctedReport(), now + 1000)
    assert.ok(after)
    const comparison = compareAnalyses(baseline(), after)
    assert.ok(comparison)
    const wrapper = mount(AnalysisComparison, { props: { comparison } })
    assert.match(wrapper.text(), /Antes.*65%.*Agora.*40%/)
    assert.match(wrapper.text(), /Deixou de ser exibida \(1\)/)
    assert.match(wrapper.text(), /não comprova melhora financeira/)
    assert.doesNotMatch(wrapper.text(), /Resolvid[oa]/)
    assert.equal(wrapper.findAll('details').length, 2)
    await wrapper.get('button').trigger('click')
    assert.equal(wrapper.emitted('discard')?.length, 1)
    wrapper.unmount()
  })
  it('explica falta de dados, valores indisponíveis e escapa texto guardado', () => {
    const input = comparisonInput()
    input.current = { revenueCents: 0, costCents: 0, expenseCents: 0, quantity: 0, saleCount: 0 }
    input.products = []
    input.topExpense = null
    const after = captureAnalysis(analyzeSuggestions(input), now + 1000)
    assert.ok(after)
    const before = baseline()
    const first = before.suggestions[0]
    assert.ok(first)
    first.title = '<img src=x onerror=alert(1)>'
    const comparison = compareAnalyses(before, after)
    assert.ok(comparison)
    const wrapper = mount(AnalysisComparison, { props: { comparison } })
    assert.match(wrapper.text(), /Indisponível/)
    assert.match(wrapper.text(), /dados insuficientes ou cobertura parcial/)
    assert.match(wrapper.text(), /<img src=x onerror=alert\(1\)>/)
    assert.equal(wrapper.find('img').exists(), false)
    wrapper.unmount()
  })
  it('distingue nenhuma mudança de novas sugestões e de evidências atualizadas', () => {
    const before = baseline()
    const unchanged = compareAnalyses(before, { ...before, capturedAt: now + 1000 })
    assert.ok(unchanged)
    const wrapper = mount(AnalysisComparison, { props: { comparison: unchanged } })
    assert.match(wrapper.text(), /Nenhuma mudança/)
    wrapper.unmount()
    const input = comparisonInput()
    input.current.expenseCents = 50000
    input.topExpense = { category: 'DEMO · Energia', amountCents: 50000 }
    const after = captureAnalysis(analyzeSuggestions(input), now + 1000)
    assert.ok(after)
    before.suggestions = before.suggestions.filter((item) => item.ruleId !== 'SALES_DROP')
    const changed = compareAnalyses(before, after)
    assert.ok(changed)
    const updated = mount(AnalysisComparison, { props: { comparison: changed } })
    assert.match(updated.text(), /Passou a ser exibida \(1\)/)
    assert.match(updated.text(), /Continua em atenção com dados diferentes \(1\)/)
    updated.unmount()
  })
})

describe('referência temporária na tela de análise', () => {
  async function confirm(wrapper: ReturnType<typeof mount>) {
    await wrapper.get('#records-complete').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
  }
  it('conserva a referência no percurso sugestão → produtos → análise e exige nova confirmação', async () => {
    const input = comparisonInput()
    const api = vi
      .fn()
      .mockImplementation(
        async (path: string, options?: { query?: { recordsComplete?: string } }) => {
          if (path === '/api/products') {
            return { items: [], total: 0, page: 1, pageSize: 20 }
          }
          return analyzeSuggestions({
            ...input,
            recordsComplete: options?.query?.recordsComplete === 'true',
          })
        },
      )
    vi.stubGlobal('$fetch', api)
    const initial = mount(Suggestions)
    await flushPromises()
    await confirm(initial)
    const href = initial.get('[data-rule="BELOW_COST"] nav a').attributes('href')
    assert.equal(href, '/produtos?analysisTo=2026-10-14')
    const reference = sessionStorage.getItem(REFERENCE_STORAGE_KEY)
    assert.ok(reference)
    initial.unmount()
    const url = new URL(href, 'http://localhost')
    vi.stubGlobal('useRoute', () => ({ query: Object.fromEntries(url.searchParams) }))
    const products = mount(Products)
    await flushPromises()
    const back = products.get('a.secondary-link').attributes('href')
    assert.equal(back, '/sugestoes?to=2026-10-14')
    assert.equal(sessionStorage.getItem(REFERENCE_STORAGE_KEY), reference)
    products.unmount()
    input.belowCostProducts = []
    const returnUrl = new URL(back, 'http://localhost')
    vi.stubGlobal('useRoute', () => ({ query: Object.fromEntries(returnUrl.searchParams) }))
    const returned = mount(Suggestions)
    await flushPromises()
    assert.equal(returned.get<HTMLInputElement>('#suggestions-to').element.value, '2026-10-14')
    assert.equal(returned.get<HTMLInputElement>('#records-complete').element.checked, false)
    assert.equal(returned.find('.analysis-comparison').exists(), false)
    assert.equal(sessionStorage.getItem(REFERENCE_STORAGE_KEY), reference)
    await confirm(returned)
    assert.match(returned.get('.analysis-comparison').text(), /Deixou de ser exibida \(1\)/)
    assert.equal(returned.find('[data-rule="BELOW_COST"]').exists(), false)
    assert.equal(returned.findAll('[data-rule]').length, 3)
    returned.unmount()
  })
  it('sobrevive ao retorno dos registros sem restaurar a confirmação e compara só após conferir', async () => {
    sessionStorage.setItem(REFERENCE_STORAGE_KEY, JSON.stringify(baseline()))
    const unconfirmed = analyzeSuggestions({ ...comparisonInput(), recordsComplete: false })
    const api = vi.fn().mockResolvedValueOnce(unconfirmed).mockResolvedValueOnce(correctedReport())
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Suggestions)
    await flushPromises()
    assert.equal(wrapper.find('.analysis-comparison').exists(), false)
    assert.equal(wrapper.get<HTMLInputElement>('#records-complete').element.checked, false)
    assert.equal(
      JSON.parse(sessionStorage.getItem(REFERENCE_STORAGE_KEY) ?? '{}').summary.expenseCents,
      48750,
    )
    await confirm(wrapper)
    assert.match(wrapper.get('.analysis-comparison').text(), /65%.*40%/)
    assert.equal(
      JSON.parse(sessionStorage.getItem(REFERENCE_STORAGE_KEY) ?? '{}').summary.expenseCents,
      30000,
    )
    await wrapper.get('.analysis-comparison button').trigger('click')
    assert.equal(sessionStorage.getItem(REFERENCE_STORAGE_KEY), null)
    assert.equal(wrapper.find('.analysis-comparison').exists(), false)
    assert.equal(wrapper.find('.analysis-status').exists(), true)
    wrapper.unmount()
  })
  it('captura a primeira consulta confirmada, mantém referência na falha e recupera na repetição', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce(comparisonReport())
      .mockResolvedValueOnce(comparisonReport())
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Suggestions)
    await flushPromises()
    assert.equal(sessionStorage.getItem(REFERENCE_STORAGE_KEY), null)
    await confirm(wrapper)
    assert.match(wrapper.get('.reference-note').text(), /Referência guardada/)
    const stored = sessionStorage.getItem(REFERENCE_STORAGE_KEY)
    api.mockRejectedValueOnce(new Error('dados privados'))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.equal(sessionStorage.getItem(REFERENCE_STORAGE_KEY), stored)
    assert.equal(wrapper.find('.analysis-comparison').exists(), false)
    assert.doesNotMatch(wrapper.get('[role="alert"]').text(), /dados privados/)
    api.mockResolvedValueOnce(correctedReport())
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.equal(wrapper.find('.analysis-comparison').exists(), true)
    await wrapper.get('#records-complete').setValue(false)
    assert.equal(wrapper.find('.analysis-comparison').exists(), false)
    await wrapper.get('#suggestions-to').setValue('2026-10-07')
    assert.equal(sessionStorage.getItem(REFERENCE_STORAGE_KEY), null)
    wrapper.unmount()
  })
  it('descarta referências inválidas, vencidas e de outra data do servidor', async () => {
    for (const raw of [
      '{broken',
      JSON.stringify({ ...baseline(), capturedAt: now - REFERENCE_MAX_AGE }),
      JSON.stringify({ ...baseline(), asOfDate: '2026-10-16' }),
    ]) {
      sessionStorage.setItem(REFERENCE_STORAGE_KEY, raw)
      vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(comparisonReport()))
      const wrapper = mount(Suggestions)
      await flushPromises()
      assert.equal(sessionStorage.getItem(REFERENCE_STORAGE_KEY), null)
      await confirm(wrapper)
      assert.equal(wrapper.find('.analysis-comparison').exists(), false)
      wrapper.unmount()
    }
  })
  it('continua funcionando quando o navegador bloqueia o armazenamento', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(comparisonReport()))
    const wrapper = mount(Suggestions)
    await flushPromises()
    assert.match(wrapper.text(), /navegador não permite/)
    await confirm(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.match(wrapper.get('.analysis-comparison').text(), /Nenhuma mudança/)
    await wrapper.get('.analysis-comparison button').trigger('click')
    assert.equal(wrapper.find('.analysis-comparison').exists(), false)
    wrapper.unmount()
  })
})
