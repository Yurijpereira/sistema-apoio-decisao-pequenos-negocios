import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { analyzeSuggestions, comparisonPeriods } from '../../server/decision/suggestions.ts'
import type { DecisionInput } from '../../shared/types/suggestions.ts'

function input(): DecisionInput {
  return {
    asOfDate: '2026-10-15',
    to: '2026-10-14',
    recordsComplete: true,
    current: {
      revenueCents: 75000,
      costCents: 60000,
      quantity: 75,
      saleCount: 3,
      expenseCents: 48750,
    },
    previous: {
      revenueCents: 100000,
      costCents: 80000,
      quantity: 100,
      saleCount: 3,
      expenseCents: 0,
    },
    products: [
      {
        productId: 'historical',
        productName: 'Pão histórico',
        revenueCents: 3000,
        costCents: 2400,
        quantity: 3,
        saleCount: 3,
      },
    ],
    belowCostProducts: [
      { productId: 'catalog', productName: 'Bolo', unitPriceCents: 500, unitCostCents: 600 },
    ],
    topExpense: { category: 'Energia', amountCents: 48750 },
  }
}

describe('motor integrado: testes escritos antes da implementação', () => {
  it('produz quatro regras ordenadas, evidências reproduzíveis e bases distintas', () => {
    const result = analyzeSuggestions(input())
    assert.deepEqual(
      result.suggestions.map((item) => item.ruleId),
      ['BELOW_COST', 'LOW_MARGIN', 'EXPENSE_PRESSURE', 'SALES_DROP'],
    )
    assert.equal(result.suggestions[0]?.severity, 'high')
    assert.equal(result.suggestions[0]?.period, null)
    assert.equal(
      result.suggestions.find((item) => item.ruleId === 'BELOW_COST')?.evidence.grossMarginPercent,
      -20,
    )
    assert.equal(
      result.suggestions.find((item) => item.ruleId === 'LOW_MARGIN')?.evidence.grossMarginPercent,
      20,
    )
    assert.equal(
      result.suggestions.find((item) => item.ruleId === 'EXPENSE_PRESSURE')?.evidence
        .expenseRevenuePercent,
      65,
    )
    assert.equal(
      result.suggestions.find((item) => item.ruleId === 'SALES_DROP')?.evidence
        .revenueChangePercent,
      -25,
    )
    assert.deepEqual(result.period, { from: '2026-10-08', to: '2026-10-14' })
    for (const suggestion of result.suggestions) {
      assert.ok(suggestion.reason && suggestion.action && suggestion.limitations.length)
      assert.ok(suggestion.evidence.basis)
    }
    assert.deepEqual(result, analyzeSuggestions(input()))
  })
  it('testa limites exatos sem arredondar o gatilho', () => {
    const data = input()
    data.current.revenueCents = 100000
    data.current.expenseCents = 59999
    data.topExpense = { category: 'Energia', amountCents: 59999 }
    data.products[0] = {
      productId: 'p',
      productName: 'Pão',
      revenueCents: 10000,
      costCents: 7501,
      quantity: 3,
      saleCount: 3,
    }
    assert.ok(analyzeSuggestions(data).suggestions.some((item) => item.ruleId === 'LOW_MARGIN'))
    assert.ok(
      !analyzeSuggestions(data).suggestions.some((item) => item.ruleId === 'EXPENSE_PRESSURE'),
    )
    data.products[0].costCents = 7500
    data.current.expenseCents = 60000
    data.topExpense.amountCents = 60000
    assert.ok(!analyzeSuggestions(data).suggestions.some((item) => item.ruleId === 'LOW_MARGIN'))
    assert.ok(
      analyzeSuggestions(data).suggestions.some((item) => item.ruleId === 'EXPENSE_PRESSURE'),
    )
    data.current.revenueCents = 80001
    assert.ok(!analyzeSuggestions(data).suggestions.some((item) => item.ruleId === 'SALES_DROP'))
    data.current.revenueCents = 80000
    assert.ok(analyzeSuggestions(data).suggestions.some((item) => item.ruleId === 'SALES_DROP'))
  })
  it('abstém-se de análises históricas sem confirmação ou com período aberto/futuro', () => {
    for (const data of [
      { ...input(), recordsComplete: false },
      { ...input(), to: '2026-10-15' },
      { ...input(), to: '2026-10-16' },
    ]) {
      const result = analyzeSuggestions(data)
      assert.deepEqual(
        result.suggestions.map((item) => item.ruleId),
        ['BELOW_COST'],
      )
      assert.ok(result.notices.length > 0)
    }
  })
  it('informa insuficiência de operações e base mínima, sem converter ausência em zero percentual', () => {
    const data = input()
    data.belowCostProducts = []
    data.products = []
    data.current = { revenueCents: 0, costCents: 0, quantity: 0, saleCount: 0, expenseCents: 65000 }
    data.previous.revenueCents = 0
    assert.equal(analyzeSuggestions(data).suggestions.length, 0)
    assert.match(analyzeSuggestions(data).notices.join(' '), /insuficientes|insuficiente/)
    data.current.revenueCents = 1000
    data.current.saleCount = 2
    data.previous.revenueCents = 9999
    assert.ok(!analyzeSuggestions(data).suggestions.some((item) => item.ruleId === 'SALES_DROP'))
    data.current.saleCount = 3
    assert.ok(!analyzeSuggestions(data).suggestions.some((item) => item.ruleId === 'SALES_DROP'))
  })
  it('exige três vendas por produto, permite margem negativa e trata preço zero no cadastro', () => {
    const data = input()
    data.products[0] = {
      productId: 'p',
      productName: 'Pão',
      revenueCents: 1500,
      costCents: 1800,
      quantity: 3,
      saleCount: 2,
    }
    assert.ok(!analyzeSuggestions(data).suggestions.some((item) => item.ruleId === 'LOW_MARGIN'))
    data.products[0].saleCount = 3
    assert.equal(
      analyzeSuggestions(data).suggestions.find((item) => item.ruleId === 'LOW_MARGIN')?.evidence
        .grossMarginPercent,
      -20,
    )
    data.belowCostProducts[0] = {
      productId: 'p',
      productName: 'Grátis',
      unitPriceCents: 0,
      unitCostCents: 0,
    }
    assert.equal(
      analyzeSuggestions(data).suggestions.find((item) => item.ruleId === 'BELOW_COST')?.evidence
        .grossMarginPercent,
      null,
    )
    data.belowCostProducts[0].unitPriceCents = 601
    assert.ok(!analyzeSuggestions(data).suggestions.some((item) => item.ruleId === 'BELOW_COST'))
    data.products[0].revenueCents = 0
    assert.ok(!analyzeSuggestions(data).suggestions.some((item) => item.ruleId === 'LOW_MARGIN'))
  })
  it('não transforma ausência de vendas em queda, mas calcula −100% quando há três vendas de valor zero', () => {
    const data = input()
    data.current = { revenueCents: 0, costCents: 0, quantity: 3, saleCount: 3, expenseCents: 0 }
    data.topExpense = null
    data.products = []
    assert.equal(
      analyzeSuggestions(data).suggestions.find((item) => item.ruleId === 'SALES_DROP')?.evidence
        .revenueChangePercent,
      -100,
    )
    data.current.saleCount = 0
    assert.ok(!analyzeSuggestions(data).suggestions.some((item) => item.ruleId === 'SALES_DROP'))
    data.current.saleCount = 3
    data.previous.saleCount = 2
    assert.ok(!analyzeSuggestions(data).suggestions.some((item) => item.ruleId === 'SALES_DROP'))
  })
  it('explica ausência de gatilhos sem declarar saúde financeira e não arredonda a margem ponderada', () => {
    const data = input()
    data.belowCostProducts = []
    data.current.revenueCents = 100000
    data.current.expenseCents = 30000
    data.topExpense = { category: 'Energia', amountCents: 30000 }
    data.products[0] = {
      productId: 'p',
      productName: 'Pão',
      revenueCents: 100000,
      costCents: 60000,
      quantity: 75,
      saleCount: 3,
    }
    const result = analyzeSuggestions(data)
    assert.equal(result.suggestions.length, 0)
    assert.match(result.notices.join(' '), /não comprova saúde financeira/)
  })
  it('mantém ordenação estável independente da ordem das entradas e não altera os dados', () => {
    const data = input()
    data.products.push({ ...data.products[0]!, productId: 'aaa' })
    data.belowCostProducts.push({ ...data.belowCostProducts[0]!, productId: 'aaa' })
    const snapshot = structuredClone(data)
    const result = analyzeSuggestions(data)
    assert.deepEqual(data, snapshot)
    assert.deepEqual(
      result,
      analyzeSuggestions({
        ...data,
        products: [...data.products].reverse(),
        belowCostProducts: [...data.belowCostProducts].reverse(),
      }),
    )
  })
  it('rejeita dados inválidos, totais inseguros e períodos fora do calendário suportado', () => {
    for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const data = input()
      data.current.revenueCents = value
      assert.throws(() => analyzeSuggestions(data), RangeError)
    }
    assert.throws(() => comparisonPeriods('2026-02-30'), RangeError)
    assert.throws(() => comparisonPeriods('0001-01-13'), RangeError)
    assert.throws(() => analyzeSuggestions({ ...input(), asOfDate: 'invalid' }), RangeError)
    const data = input()
    data.products[0]!.productName = ''
    assert.throws(() => analyzeSuggestions(data), RangeError)
  })
  it('calcula semanas civis consecutivas inclusive em ano bissexto e mudança de ano', () => {
    assert.deepEqual(comparisonPeriods('2024-03-01'), {
      current: { from: '2024-02-24', to: '2024-03-01' },
      previous: { from: '2024-02-17', to: '2024-02-23' },
    })
    assert.deepEqual(comparisonPeriods('2026-01-06'), {
      current: { from: '2025-12-31', to: '2026-01-06' },
      previous: { from: '2025-12-24', to: '2025-12-30' },
    })
  })
})
