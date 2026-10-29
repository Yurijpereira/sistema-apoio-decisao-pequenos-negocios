import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  parseProductInput,
  parseProductId,
  parseProductQuery,
  parseProductStatus,
} from '../../server/validation/products.ts'
import { MAX_PRODUCT_CENTS } from '../../shared/types/product.ts'
import { parseMoneyInput } from '../../shared/utils/money.ts'

const input = { name: ' Pão integral ', salePriceCents: 1000, unitCostCents: 800 }

describe('entrada de produtos', () => {
  it('normaliza nome e aceita preço zero, custo superior e limite inteiro PostgreSQL', () => {
    assert.deepEqual(parseProductInput(input), { ...input, name: 'Pão integral' })
    assert.equal(parseProductInput({ ...input, salePriceCents: 0 }).salePriceCents, 0)
    assert.equal(
      parseProductInput({ ...input, unitCostCents: MAX_PRODUCT_CENTS }).unitCostCents,
      MAX_PRODUCT_CENTS,
    )
  })
  it('rejeita payloads, campos extras e tipos inválidos sem coerção', () => {
    for (const invalid of [
      null,
      [],
      'produto',
      {},
      { ...input, active: true },
      { ...input, id: 'x' },
      { ...input, name: 1 },
      { ...input, name: '  ' },
      { ...input, name: 'p'.repeat(121) },
      { ...input, name: 'Pão\nIntegral' },
    ]) {
      assert.throws(() => parseProductInput(invalid))
    }
    for (const field of ['salePriceCents', 'unitCostCents']) {
      for (const invalid of [
        -1,
        0.1,
        NaN,
        Infinity,
        MAX_PRODUCT_CENTS + 1,
        '1000',
        null,
        undefined,
      ]) {
        assert.throws(() => parseProductInput({ ...input, [field]: invalid }))
      }
    }
  })
  it('valida identificador e alteração de status sem aceitar exclusão ou campos extras', () => {
    const id = '9c324b81-4434-4e66-b57a-0eaac04b0806'
    assert.equal(parseProductId(id), id)
    for (const invalid of [undefined, '1', '../', '']) {
      assert.throws(() => parseProductId(invalid))
    }
    assert.deepEqual(parseProductStatus({ active: false }), { active: false })
    assert.deepEqual(parseProductStatus({ active: true }), { active: true })
    for (const invalid of [{}, { active: 'false' }, { active: false, name: 'x' }, null]) {
      assert.throws(() => parseProductStatus(invalid))
    }
  })
  it('limita paginação e aceita somente filtros conhecidos', () => {
    assert.deepEqual(parseProductQuery({}), { page: 1, status: 'all' })
    assert.deepEqual(parseProductQuery({ page: '2', status: 'inactive' }), {
      page: 2,
      status: 'inactive',
    })
    assert.equal(parseProductQuery({ status: 'active' }).status, 'active')
    for (const invalid of [
      { page: '0' },
      { page: '1.5' },
      { page: '100001' },
      { page: ['1', '2'] },
      { status: 'true' },
      { limit: '100000' },
    ]) {
      assert.throws(() => parseProductQuery(invalid))
    }
  })
})

describe('conversão de reais para centavos', () => {
  it('converte decimais de forma exata, sem arredondar frações extras', () => {
    for (const [value, expected] of [
      ['10,00', 1000],
      ['0.29', 29],
      [' 1,1 ', 110],
      ['0', 0],
      ['21474836,47', MAX_PRODUCT_CENTS],
    ] as const) {
      assert.equal(parseMoneyInput(value), expected)
    }
    for (const invalid of [
      '',
      '-1',
      '1,001',
      '1e2',
      '1.000,00',
      'Infinity',
      '21474836,48',
      '0x10',
      '1,',
    ]) {
      assert.equal(parseMoneyInput(invalid), null)
    }
  })
})
