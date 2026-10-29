import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  calculateExpenseRevenuePercent,
  calculateGrossMarginPercent,
  calculateRevenueChangePercent,
} from '../../server/decision/metrics.ts'

describe('margem bruta estimada', () => {
  it('calcula 20% para preço de R$ 10 e custo de R$ 8', () => {
    assert.equal(calculateGrossMarginPercent(1000, 800), 20)
  })

  it('preserva margem negativa, custo zero e limites sem arredondar', () => {
    assert.equal(calculateGrossMarginPercent(500, 600), -20)
    assert.equal(calculateGrossMarginPercent(1000, 0), 100)
    assert.equal(calculateGrossMarginPercent(10000, 7501), 24.99)
    assert.equal(calculateGrossMarginPercent(10000, 7500), 25)
  })

  it('retorna indisponibilidade quando o preço é zero', () => {
    assert.equal(calculateGrossMarginPercent(0, 800), null)
    assert.equal(calculateGrossMarginPercent(0, 0), null)
  })

  it('rejeita valores negativos, fracionários, não finitos e inseguros', () => {
    for (const invalid of [-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => calculateGrossMarginPercent(invalid, 800), RangeError)
      assert.throws(() => calculateGrossMarginPercent(1000, invalid), RangeError)
      assert.throws(() => calculateGrossMarginPercent(0, invalid), RangeError)
    }
  })
})

describe('proporção despesa/receita', () => {
  it('calcula 65% com despesas de R$ 650 e receita de R$ 1.000', () => {
    assert.equal(calculateExpenseRevenuePercent(65000, 100000), 65)
  })

  it('aceita despesas zero e proporções acima de 100%', () => {
    assert.equal(calculateExpenseRevenuePercent(0, 1000), 0)
    assert.equal(calculateExpenseRevenuePercent(2000, 1000), 200)
    assert.equal(calculateExpenseRevenuePercent(5999, 10000), 59.99)
    assert.equal(calculateExpenseRevenuePercent(6000, 10000), 60)
  })

  it('não divide por receita zero', () => {
    assert.equal(calculateExpenseRevenuePercent(100, 0), null)
    assert.equal(calculateExpenseRevenuePercent(0, 0), null)
  })

  it('rejeita entradas monetárias inválidas mesmo com denominador zero', () => {
    for (const invalid of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => calculateExpenseRevenuePercent(invalid, 1000), RangeError)
      assert.throws(() => calculateExpenseRevenuePercent(1000, invalid), RangeError)
      assert.throws(() => calculateExpenseRevenuePercent(invalid, 0), RangeError)
    }
  })
})

const previous = { startDate: '2026-10-01', endDate: '2026-10-08', revenueCents: 100000 }
const current = { startDate: '2026-10-08', endDate: '2026-10-15', revenueCents: 75000 }
const asOfDate = '2026-10-15'

describe('variação da receita entre períodos completos', () => {
  it('calcula −25% entre duas semanas completas e consecutivas', () => {
    assert.equal(calculateRevenueChangePercent(previous, current, asOfDate), -25)
  })

  it('representa crescimento, estabilidade e queda de 100%', () => {
    assert.equal(
      calculateRevenueChangePercent(previous, { ...current, revenueCents: 120000 }, asOfDate),
      20,
    )
    assert.equal(
      calculateRevenueChangePercent(previous, { ...current, revenueCents: 100000 }, asOfDate),
      0,
    )
    assert.equal(
      calculateRevenueChangePercent(previous, { ...current, revenueCents: 0 }, asOfDate),
      -100,
    )
  })

  it('não compara com receita anterior zero', () => {
    assert.equal(
      calculateRevenueChangePercent({ ...previous, revenueCents: 0 }, current, asOfDate),
      null,
    )
  })

  it('abstém-se com período atual incompleto ou anterior incompleto', () => {
    assert.equal(calculateRevenueChangePercent(previous, current, '2026-10-14'), null)
    assert.equal(calculateRevenueChangePercent(previous, current, '2026-10-07'), null)
  })

  it('abstém-se com durações diferentes, lacunas, sobreposição ou ordem invertida', () => {
    assert.equal(
      calculateRevenueChangePercent(previous, { ...current, endDate: '2026-10-14' }, asOfDate),
      null,
    )
    assert.equal(
      calculateRevenueChangePercent(
        previous,
        { ...current, startDate: '2026-10-09', endDate: '2026-10-16' },
        '2026-10-16',
      ),
      null,
    )
    assert.equal(
      calculateRevenueChangePercent(
        previous,
        { ...current, startDate: '2026-10-07', endDate: '2026-10-14' },
        asOfDate,
      ),
      null,
    )
    assert.equal(calculateRevenueChangePercent(current, previous, asOfDate), null)
  })

  it('rejeita datas inválidas, formatos ambíguos e intervalos vazios/invertidos', () => {
    for (const invalid of ['2026-02-30', '2026-13-01', '08/10/2026', '2026-10-08T00:00:00Z', '']) {
      assert.throws(
        () => calculateRevenueChangePercent({ ...previous, startDate: invalid }, current, asOfDate),
        RangeError,
      )
      assert.throws(
        () => calculateRevenueChangePercent(previous, { ...current, endDate: invalid }, asOfDate),
        RangeError,
      )
      assert.throws(() => calculateRevenueChangePercent(previous, current, invalid), RangeError)
    }
    assert.throws(
      () =>
        calculateRevenueChangePercent(
          { ...previous, endDate: previous.startDate },
          current,
          asOfDate,
        ),
      RangeError,
    )
    assert.throws(
      () =>
        calculateRevenueChangePercent(previous, { ...current, endDate: '2026-10-07' }, asOfDate),
      RangeError,
    )
  })

  it('rejeita receitas inválidas antes de avaliar suficiência dos períodos', () => {
    for (const invalid of [-1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(
        () =>
          calculateRevenueChangePercent({ ...previous, revenueCents: invalid }, current, asOfDate),
        RangeError,
      )
      assert.throws(
        () =>
          calculateRevenueChangePercent(previous, { ...current, revenueCents: invalid }, asOfDate),
        RangeError,
      )
    }
  })
})
