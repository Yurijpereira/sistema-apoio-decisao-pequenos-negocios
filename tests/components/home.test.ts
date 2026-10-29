import assert from 'node:assert/strict'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, it, vi } from 'vitest'
import Home from '../../app/pages/index.vue'

afterEach(() => vi.unstubAllGlobals())
describe('tela inicial prioriza o apoio à decisão', () => {
  it('consulta sugestões e apresenta indicadores depois das explicações, sem página intermediária', async () => {
    const api = vi.fn().mockResolvedValue({
      asOfDate: '2026-10-15',
      period: { from: '2026-10-08', to: '2026-10-14' },
      previousPeriod: { from: '2026-10-01', to: '2026-10-07' },
      recordsComplete: false,
      suggestions: [],
      notices: ['Confirme a completude.'],
      summary: {
        revenueCents: 75000,
        costCents: 60000,
        expenseCents: 48750,
        quantity: 75,
        saleCount: 3,
        grossMarginPercent: 20,
        expenseRevenuePercent: 65,
      },
    })
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Home)
    await flushPromises()
    assert.equal(api.mock.calls[0]?.[0], '/api/suggestions')
    assert.equal(wrapper.findAll('h1').length, 1)
    assert.match(wrapper.get('h1').text(), /clareza/)
    const insights = wrapper.get('[aria-labelledby="insights-title"]').element
    const indicators = wrapper.get('[aria-labelledby="indicators-title"]').element
    assert.ok(insights.compareDocumentPosition(indicators) & Node.DOCUMENT_POSITION_FOLLOWING)
    assert.match(wrapper.text(), /750,00/)
    assert.match(wrapper.text(), /não comprova saúde financeira/)
    wrapper.unmount()
  })
})
