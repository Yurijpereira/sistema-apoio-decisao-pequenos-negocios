// Autorização exercitada na suíte auth; esta suíte isola persistência e regras de negócio.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createApp, toNodeListener } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, it, vi } from 'vitest'
import handler from '../../server/api/suggestions.get.ts'
import { parseSuggestionQuery } from '../../server/validation/suggestions.ts'

const db = vi.hoisted(() => ({ $transaction: vi.fn(), $queryRaw: vi.fn() }))
vi.mock('../../server/utils/admin-session.ts', () => ({ requireAdminSession: async () => {} }))
vi.mock('../../server/utils/prisma.ts', () => ({ getPrisma: () => db }))
const server = createServer(toNodeListener(createApp().use('/api/suggestions', handler)))
let base = ''
const query = '?to=2020-10-14&recordsComplete=true'
beforeAll(async () => {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  base = `http://127.0.0.1:${address.port}`
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  vi.unstubAllEnvs()
})
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'true')
  vi.stubEnv('DATABASE_URL', 'postgresql://local:local@127.0.0.1:5433/visaoativa?schema=public')
  db.$transaction.mockImplementation((run: (tx: typeof db) => Promise<unknown>) => run(db))
})
function rows(options: { revenue?: string; products?: number; expenses?: boolean } = {}): void {
  db.$queryRaw
    .mockReset()
    .mockResolvedValueOnce([
      {
        revenueCents: options.revenue ?? '75000',
        costCents: '60000',
        quantity: '75',
        saleCount: '3',
      },
    ])
    .mockResolvedValueOnce([{ expenseCents: '48750' }])
    .mockResolvedValueOnce([
      { revenueCents: '100000', costCents: '80000', quantity: '100', saleCount: '3' },
    ])
    .mockResolvedValueOnce([{ expenseCents: '0' }])
    .mockResolvedValueOnce(
      Array.from({ length: options.products ?? 1 }, (_, i) => ({
        productId: `p${i}`,
        productName: 'Pão histórico',
        revenueCents: '3000',
        costCents: '2400',
        quantity: '3',
        saleCount: '3',
      })),
    )
    .mockResolvedValueOnce([
      { productId: 'catalog', productName: 'Bolo', unitPriceCents: 500, unitCostCents: 600 },
    ])
    .mockResolvedValueOnce(
      options.expenses === false ? [] : [{ category: 'Energia', amountCents: '48750' }],
    )
}

describe('entrada e API das sugestões', () => {
  it('valida campos, datas, duplicações, confirmação e impede relógio informado pelo cliente', () => {
    assert.deepEqual(parseSuggestionQuery({}, '2026-10-15'), {
      to: '2026-10-14',
      recordsComplete: false,
    })
    for (const value of [
      null,
      [],
      { to: '2026-02-30' },
      { to: ['2026-10-14'] },
      { to: '0001-01-13' },
      { recordsComplete: true },
      { recordsComplete: 'yes' },
      { asOfDate: '2099-01-01' },
    ]) {
      assert.throws(() => parseSuggestionQuery(value, '2026-10-15'), { statusCode: 400 })
    }
  })
  it('retorna quatro regras do mesmo snapshot sem cache, com somas completas e períodos explícitos', async () => {
    rows()
    const response = await fetch(`${base}/api/suggestions${query}`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const data = await response.json()
    assert.deepEqual(
      data.suggestions.map((item: { ruleId: string }) => item.ruleId),
      ['BELOW_COST', 'LOW_MARGIN', 'EXPENSE_PRESSURE', 'SALES_DROP'],
    )
    assert.equal(data.suggestions[1].evidence.productName, 'Pão histórico')
    assert.equal(db.$transaction.mock.calls[0]?.[1].isolationLevel, 'RepeatableRead')
    assert.equal(db.$queryRaw.mock.calls.length, 7)
    const sql = db.$queryRaw.mock.calls[4]?.[0]
    assert.match(sql.text, /SUM.*quantity/)
    assert.ok(sql.values.includes('2020-10-08'))
    assert.ok(sql.values.includes('2020-10-14'))
  })
  it('responde só com aviso de cadastro sem confirmação; ausência de categoria não inventa pressão', async () => {
    rows()
    const data = await (await fetch(`${base}/api/suggestions?to=2020-10-14`)).json()
    assert.equal(data.recordsComplete, false)
    assert.deepEqual(
      data.suggestions.map((item: { ruleId: string }) => item.ruleId),
      ['BELOW_COST'],
    )
    rows({ expenses: false })
    const missing = await (await fetch(`${base}/api/suggestions${query}`)).json()
    assert.ok(
      !missing.suggestions.some((item: { ruleId: string }) => item.ruleId === 'EXPENSE_PRESSURE'),
    )
    assert.match(missing.notices.join(' '), /Sem despesas/)
  })
  it('rejeita totais inseguros e mais de 100 grupos sem devolver análise parcial', async () => {
    rows({ revenue: '9007199254740992' })
    assert.equal((await fetch(`${base}/api/suggestions${query}`)).status, 422)
    rows({ products: 101 })
    assert.equal((await fetch(`${base}/api/suggestions${query}`)).status, 422)
  })
  it('mantém o guard local antes do banco e não expõe falhas internas', async () => {
    vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'false')
    assert.equal((await fetch(`${base}/api/suggestions${query}`)).status, 403)
    vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'true')
    assert.equal(
      (
        await fetch(`${base}/api/suggestions${query}`, {
          headers: { 'x-forwarded-for': '127.0.0.1' },
        })
      ).status,
      403,
    )
    assert.equal((await fetch(`${base}/api/suggestions?asOfDate=2099-01-01`)).status, 400)
    assert.equal(db.$transaction.mock.calls.length, 0)
    db.$transaction.mockRejectedValue(new Error('password=SECRETO'))
    const response = await fetch(`${base}/api/suggestions${query}`)
    assert.equal(response.status, 503)
    assert.doesNotMatch(await response.text(), /password|SECRETO/)
  })
})
