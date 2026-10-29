import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  parseSaleInput,
  parseExpenseInput,
  parsePeriodQuery,
} from '../../server/validation/operations.ts'
import { summarizePeriod, saleAmounts } from '../../server/decision/operations.ts'
import { parseCivilDate } from '../../shared/utils/dates.ts'

const sale = {
  productId: '9c324b81-4434-4e66-b57a-0eaac04b0806',
  date: '2026-10-15',
  quantity: 2,
  unitPriceCents: 1000,
  unitCostCents: 800,
}
const expense = {
  date: '2026-10-15',
  category: ' Energia ',
  description: ' Conta sintética ',
  amountCents: 650,
}

describe('validação de vendas, despesas e períodos', () => {
  it('aceita operações válidas e normaliza textos sem coerção monetária', () => {
    assert.deepEqual(parseSaleInput(sale), sale)
    assert.deepEqual(parseExpenseInput(expense), {
      ...expense,
      category: 'Energia',
      description: 'Conta sintética',
    })
    assert.equal(
      parseExpenseInput({ ...expense, description: ' ', amountCents: 0 }).description,
      null,
    )
    assert.equal(
      parseSaleInput({ ...sale, unitPriceCents: 0, quantity: 1000000 }).quantity,
      1000000,
    )
  })
  it('rejeita quantidade fracionária/zero, datas impossíveis, campos extras e valores inválidos', () => {
    for (const value of [0, -1, 1.5, '2', 1000001, Infinity]) {
      assert.throws(() => parseSaleInput({ ...sale, quantity: value }))
    }
    for (const value of [-1, 0.5, '100', 2147483648, null]) {
      assert.throws(() => parseSaleInput({ ...sale, unitPriceCents: value }))
      assert.throws(() => parseSaleInput({ ...sale, unitCostCents: value }))
      assert.throws(() => parseExpenseInput({ ...expense, amountCents: value }))
    }
    for (const value of ['2026-02-30', '15/10/2026', '2026-10-15T00:00:00Z', '', '0000-01-01']) {
      assert.equal(parseCivilDate(value), null)
      assert.throws(() => parseSaleInput({ ...sale, date: value }))
      assert.throws(() => parseExpenseInput({ ...expense, date: value }))
    }
    assert.equal(parseCivilDate('2024-02-29'), '2024-02-29')
    assert.throws(() => parseSaleInput({ ...sale, productId: 'x' }))
    assert.throws(() => parseSaleInput({ ...sale, productNameSnapshot: 'fraude' }))
    for (const value of ['', ' ', 'x'.repeat(81), 'x\ny', null]) {
      assert.throws(() => parseExpenseInput({ ...expense, category: value }))
    }
    assert.throws(() => parseExpenseInput({ ...expense, description: 'x'.repeat(501) }))
    assert.throws(() => parseExpenseInput({ ...expense, description: 1 }))
    assert.throws(() => parseExpenseInput({ ...expense, id: 'fraude' }))
  })
  it('exige período explícito, inclusivo, ordenado e paginação limitada', () => {
    const query = { from: '2026-10-01', to: '2026-10-31' }
    assert.deepEqual(parsePeriodQuery(query), { ...query, page: 1 })
    assert.equal(parsePeriodQuery({ ...query, page: '2' }).page, 2)
    for (const invalid of [
      {},
      { ...query, from: '2026-11-01' },
      { ...query, to: ['2026-10-31'] },
      { ...query, page: '0' },
      { ...query, page: '100001' },
      { ...query, extra: 'x' },
    ]) {
      assert.throws(() => parsePeriodQuery(invalid))
    }
  })
})

describe('indicadores históricos com centavos inteiros', () => {
  it('multiplica quantidade usando os valores da venda, inclusive margem negativa', () => {
    assert.deepEqual(saleAmounts(sale), {
      revenueCents: 2000,
      costCents: 1600,
      grossMarginPercent: 20,
    })
    assert.equal(saleAmounts({ ...sale, unitCostCents: 1200 }).grossMarginPercent, -20)
    assert.equal(saleAmounts({ ...sale, unitPriceCents: 0 }).grossMarginPercent, null)
  })
  it('calcula resumo, quantidade e proporção sem inferir lucro líquido', () => {
    const summary = summarizePeriod({
      revenueCents: '2000',
      costCents: '1600',
      quantity: '2',
      saleCount: '1',
      expenseCents: '650',
    })
    assert.deepEqual(summary, {
      revenueCents: 2000,
      costCents: 1600,
      quantity: 2,
      saleCount: 1,
      expenseCents: 650,
      grossMarginPercent: 20,
      expenseRevenuePercent: 32.5,
    })
    assert.equal(
      summarizePeriod({
        revenueCents: '0',
        costCents: '0',
        quantity: '0',
        saleCount: '0',
        expenseCents: '650',
      }).expenseRevenuePercent,
      null,
    )
  })
  it('recusa agregados inseguros em vez de perder precisão', () => {
    const summary = {
      revenueCents: '9007199254740992',
      costCents: '0',
      quantity: '1',
      saleCount: '1',
      expenseCents: '0',
    }
    assert.throws(() => summarizePeriod(summary), RangeError)
    assert.throws(() => summarizePeriod({ ...summary, revenueCents: '-1' }), RangeError)
  })
})
