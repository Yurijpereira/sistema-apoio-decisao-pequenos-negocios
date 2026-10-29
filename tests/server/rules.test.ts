import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { evaluateLowMargin } from '../../server/decision/rules.ts'

const product = { productName: 'Pão integral', unitPriceCents: 1000, unitCostCents: 800 }

describe('LOW_MARGIN demonstrativa', () => {
  it('explica a margem de 20% e o limiar experimental de 25%', () => {
    const suggestion = evaluateLowMargin(product)
    assert.ok(suggestion)
    assert.equal(suggestion.ruleId, 'LOW_MARGIN')
    assert.equal(suggestion.severity, 'warning')
    assert.match(suggestion.title, /Pão integral/)
    assert.match(suggestion.reason, /20%/)
    assert.match(suggestion.reason, /25%/)
    assert.match(suggestion.reason, /experimental/)
    assert.deepEqual(suggestion.evidence, {
      productName: 'Pão integral',
      unitPriceCents: 1000,
      unitCostCents: 800,
      grossMarginPercent: 20,
      thresholdPercent: 25,
      basis: 'registered-unit-values',
    })
    assert.match(suggestion.action, /preço/)
    assert.match(suggestion.limitations.join(' '), /não representa lucro líquido/)
    assert.match(suggestion.limitations.join(' '), /vendas/)
  })

  it('dispara abaixo de 25%, incluindo 24,99%, mas não no limiar ou acima', () => {
    assert.ok(evaluateLowMargin({ ...product, unitPriceCents: 10000, unitCostCents: 7501 }))
    assert.equal(
      evaluateLowMargin({ ...product, unitPriceCents: 10000, unitCostCents: 7500 }),
      null,
    )
    assert.equal(evaluateLowMargin({ ...product, unitCostCents: 0 }), null)
    // A comparação usa a margem original: 24,999% não pode virar 25% no gatilho.
    assert.ok(evaluateLowMargin({ ...product, unitPriceCents: 100000, unitCostCents: 75001 }))
  })

  it('mantém custo igual/superior ao preço como aviso de cadastro nesta etapa', () => {
    assert.equal(
      evaluateLowMargin({ ...product, unitCostCents: 1000 })?.evidence.grossMarginPercent,
      0,
    )
    assert.equal(
      evaluateLowMargin({ ...product, unitPriceCents: 500, unitCostCents: 600 })?.evidence
        .grossMarginPercent,
      -20,
    )
  })

  it('abstém-se com preço zero e valida o custo antes da abstenção', () => {
    assert.equal(evaluateLowMargin({ ...product, unitPriceCents: 0 }), null)
    assert.throws(
      () => evaluateLowMargin({ ...product, unitPriceCents: 0, unitCostCents: -1 }),
      RangeError,
    )
  })

  it('rejeita nomes vazios/excessivos e normaliza espaços externos', () => {
    for (const invalid of ['', '   ', 'p'.repeat(121)]) {
      assert.throws(() => evaluateLowMargin({ ...product, productName: invalid }), RangeError)
    }
    assert.equal(
      evaluateLowMargin({ ...product, productName: ' Pão integral ' })?.evidence.productName,
      'Pão integral',
    )
  })

  it('rejeita preços e custos inválidos', () => {
    for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => evaluateLowMargin({ ...product, unitPriceCents: invalid }), RangeError)
      assert.throws(() => evaluateLowMargin({ ...product, unitCostCents: invalid }), RangeError)
    }
  })

  it('produz a mesma evidência e explicação sem modificar a entrada', () => {
    const frozenProduct = Object.freeze({ ...product })
    assert.deepEqual(evaluateLowMargin(frozenProduct), evaluateLowMargin(frozenProduct))
    assert.deepEqual(frozenProduct, product)
  })
})
