import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  analysisDate,
  analysisHref,
  recordPeriod,
  recordsHref,
} from '../../app/utils/analysis-context'

describe('contexto seguro entre sugestão e registros', () => {
  it('aceita somente datas civis em que caibam as duas semanas', () => {
    assert.equal(analysisDate('2026-10-14'), '2026-10-14')
    for (const value of [
      undefined,
      null,
      ['2026-10-14'],
      '2026-02-30',
      '0001-01-13',
      '//evil.example',
    ]) {
      assert.equal(analysisDate(value), null)
    }
  })
  it('valida as duas datas do filtro sem coerção de parâmetros duplicados', () => {
    assert.deepEqual(recordPeriod({ from: '2026-10-08', to: '2026-10-14' }), {
      from: '2026-10-08',
      to: '2026-10-14',
    })
    for (const query of [
      { from: '2026-10-15', to: '2026-10-14' },
      { from: ['2026-10-08'], to: '2026-10-14' },
      { from: 'invalid' },
      {},
    ]) {
      assert.equal(recordPeriod(query), null)
    }
  })
  it('mantém a semana original de análise ao consultar as vendas anteriores', () => {
    assert.equal(
      recordsHref({ from: '2026-10-01', to: '2026-10-07' }, '2026-10-14', 'sales-title'),
      '/registros?from=2026-10-01&to=2026-10-07&analysisTo=2026-10-14#sales-title',
    )
    assert.equal(analysisHref('2026-10-14'), '/sugestoes?to=2026-10-14')
    assert.equal(analysisHref('invalid'), '/sugestoes')
  })
})
