import assert from 'node:assert/strict'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, it, vi } from 'vitest'
import Suggestions from '../../app/pages/sugestoes.vue'
import SuggestionCard from '../../app/components/SuggestionCard.vue'
import type { Suggestion, SuggestionReport } from '../../shared/types/suggestions.ts'

function report(): SuggestionReport {
  return {
    summary: {
      revenueCents: 3000,
      costCents: 2400,
      expenseCents: 650,
      quantity: 3,
      saleCount: 3,
      grossMarginPercent: 20,
      expenseRevenuePercent: 21.67,
    },
    asOfDate: '2026-10-15',
    period: { from: '2026-10-08', to: '2026-10-14' },
    previousPeriod: { from: '2026-10-01', to: '2026-10-07' },
    recordsComplete: true,
    notices: [],
    suggestions: [
      {
        key: 'LOW_MARGIN:p',
        ruleId: 'LOW_MARGIN',
        severity: 'warning',
        title: '<img src=x> Pão histórico',
        reason: 'Margem abaixo do limiar.',
        evidence: {
          basis: 'historical-sales',
          productId: 'p',
          productName: '<img src=x> Pão histórico',
          revenueCents: 3000,
          costCents: 2400,
          saleCount: 3,
          quantity: 3,
          grossMarginPercent: 20,
          thresholdPercent: 25,
          minimumSales: 3,
        },
        action: 'Confira os custos.',
        limitations: ['Não representa lucro líquido.'],
        period: { from: '2026-10-08', to: '2026-10-14' },
      },
    ],
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sugestões com evidência e abstenção', () => {
  it('apresenta evidência histórica, período, ação e limitações sem renderizar HTML de nomes', () => {
    const item = report().suggestions[0]
    assert.ok(item)
    const wrapper = mount(SuggestionCard, { props: { suggestion: item, asOfDate: '2026-10-15' } })
    assert.match(wrapper.text(), /2026-10-08 a 2026-10-14/)
    assert.match(wrapper.text(), /30,00/)
    assert.match(wrapper.text(), /24,00/)
    assert.match(wrapper.text(), /20/)
    assert.match(wrapper.text(), /Ação sugerida.*Confira os custos/)
    assert.match(wrapper.get('details').text(), /Não representa lucro líquido/)
    assert.equal(wrapper.find('img').exists(), false)
    wrapper.unmount()
  })
  it('distingue cadastro sem período e margem indisponível', () => {
    const wrapper = mount(SuggestionCard, {
      props: {
        asOfDate: '2026-10-15',
        suggestion: {
          key: 'BELOW_COST:p',
          title: 'Cadastro atual',
          reason: 'Preço zero.',
          action: 'Confira o preço.',
          limitations: ['Sem evidência de venda.'],
          ruleId: 'BELOW_COST',
          severity: 'high',
          period: null,
          evidence: {
            basis: 'current-catalog',
            productId: 'p',
            productName: 'Grátis',
            unitPriceCents: 0,
            unitCostCents: 600,
            grossMarginPercent: null,
          },
        },
      },
    })
    assert.match(wrapper.text(), /Prioridade alta/)
    assert.match(wrapper.text(), /Cadastro atual consultado em 2026-10-15/)
    assert.match(wrapper.text(), /Indisponível/)
    assert.match(wrapper.text(), /6,00/)
    wrapper.unmount()
  })
  it('expõe categoria de maior despesa e os dois períodos de comparação', () => {
    const base = {
      key: 'test',
      title: 'Análise',
      reason: 'Limiar atingido.',
      action: 'Confira os dados.',
      limitations: ['Experimental.'],
      period: { from: '2026-10-08', to: '2026-10-14' },
      severity: 'warning' as const,
    }
    const items: Suggestion[] = [
      {
        ...base,
        ruleId: 'EXPENSE_PRESSURE',
        evidence: {
          basis: 'period-expenses',
          revenueCents: 100000,
          expenseCents: 65000,
          expenseRevenuePercent: 65,
          thresholdPercent: 60,
          topExpense: { category: 'Energia', amountCents: 65000 },
        },
      },
      {
        ...base,
        ruleId: 'SALES_DROP',
        previousPeriod: { from: '2026-10-01', to: '2026-10-07' },
        evidence: {
          basis: 'comparable-periods',
          revenueCents: 75000,
          previousRevenueCents: 100000,
          saleCount: 3,
          previousSaleCount: 3,
          revenueChangePercent: -25,
          thresholdPercent: 20,
          minimumSales: 3,
          minimumPreviousRevenueCents: 10000,
        },
      },
    ]
    for (const item of items) {
      const wrapper = mount(SuggestionCard, { props: { suggestion: item, asOfDate: '2026-10-15' } })
      if (item.ruleId === 'EXPENSE_PRESSURE') {
        assert.match(wrapper.text(), /Energia: R\$\s650,00/)
      } else {
        assert.match(wrapper.text(), /Comparação: 2026-10-01 a 2026-10-07/)
        assert.match(wrapper.text(), /-25/)
      }
      wrapper.unmount()
    }
  })
  it('consulta sem confirmação inicial, exige nova confirmação após mudar data e atualiza evidências', async () => {
    const first = {
      ...report(),
      recordsComplete: false,
      suggestions: [],
      notices: ['Confirme a completude.'],
    }
    const api = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(report())
      .mockResolvedValueOnce({ ...report(), suggestions: [], notices: ['Nenhum limiar atingido.'] })
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Suggestions)
    await flushPromises()
    assert.match(wrapper.get('[data-testid="empty-suggestions"]').text(), /Nenhuma sugestão/)
    assert.equal(api.mock.calls[0]?.[1].query.recordsComplete, 'false')
    await wrapper.get('#records-complete').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.equal(wrapper.findAll('[data-rule="LOW_MARGIN"]').length, 1)
    assert.equal(api.mock.calls[1]?.[1].query.recordsComplete, 'true')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.equal(wrapper.findAll('[data-rule]').length, 0)
    await wrapper.get('#suggestions-to').setValue('2026-10-07')
    assert.equal(wrapper.get<HTMLInputElement>('#records-complete').element.checked, false)
    assert.equal(wrapper.find('[aria-labelledby="insights-title"]').exists(), false)
    wrapper.unmount()
  })
  it('oculta resultados antigos enquanto carrega, bloqueia requisição duplicada e permite recuperar falha', async () => {
    let resolve: (value: SuggestionReport) => void = () => {
      throw new Error('Consulta não iniciada.')
    }
    const api = vi.fn().mockImplementationOnce(
      () =>
        new Promise<SuggestionReport>((done) => {
          resolve = done
        }),
    )
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Suggestions)
    await wrapper.get('form').trigger('submit')
    assert.equal(api.mock.calls.length, 1)
    assert.ok(wrapper.get('fieldset').attributes('disabled') !== undefined)
    resolve(report())
    await flushPromises()
    api.mockRejectedValueOnce({ statusCode: 422 })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.match(wrapper.get('[role="alert"]').text(), /Nenhum resultado parcial/)
    assert.equal(wrapper.findAll('[data-rule]').length, 0)
    api.mockRejectedValueOnce(new Error('senha privada'))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.doesNotMatch(wrapper.get('[role="alert"]').text(), /senha privada/)
    api.mockResolvedValueOnce(report())
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.equal(wrapper.find('[role="alert"]').exists(), false)
    wrapper.unmount()
  })
})
