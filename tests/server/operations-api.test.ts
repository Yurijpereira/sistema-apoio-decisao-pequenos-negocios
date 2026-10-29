// Autorização exercitada na suíte auth; esta suíte isola persistência e regras de negócio.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createApp, createRouter, toNodeListener } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, it, vi } from 'vitest'
import sales from '../../server/api/sales/index.get.ts'
import createSale from '../../server/api/sales/index.post.ts'
import updateSale from '../../server/api/sales/[id].put.ts'
import expenses from '../../server/api/expenses/index.get.ts'
import createExpense from '../../server/api/expenses/index.post.ts'
import updateExpense from '../../server/api/expenses/[id].put.ts'
import removeExpense from '../../server/api/expenses/[id].delete.ts'
import summary from '../../server/api/period-summary.get.ts'

const db = vi.hoisted(() => ({
  product: { findUnique: vi.fn() },
  sale: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  expense: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
}))
vi.mock('../../server/utils/admin-session.ts', () => ({ requireAdminSession: async () => {} }))
vi.mock('../../server/utils/prisma.ts', () => ({ getPrisma: () => db }))
const id = '9c324b81-4434-4e66-b57a-0eaac04b0806'
const otherId = '9c324b81-4434-4e66-b57a-0eaac04b0807'
const time = new Date('2026-10-15T00:00:00Z')
const sale = {
  id,
  productId: id,
  productNameSnapshot: 'Pão histórico',
  date: time,
  quantity: 2,
  unitPriceCents: 1000,
  unitCostCents: 800,
  createdAt: time,
  updatedAt: time,
}
const saleInput = {
  productId: id,
  date: '2026-10-15',
  quantity: 2,
  unitPriceCents: 1000,
  unitCostCents: 800,
}
const expense = {
  id,
  date: time,
  category: 'Energia',
  description: null,
  amountCents: 650,
  createdAt: time,
  updatedAt: time,
}
const expenseInput = {
  date: '2026-10-15',
  category: 'Energia',
  amountCents: 650,
  description: null,
}
const server = createServer(
  toNodeListener(
    createApp().use(
      createRouter()
        .get('/api/sales', sales)
        .post('/api/sales', createSale)
        .put('/api/sales/:id', updateSale)
        .get('/api/expenses', expenses)
        .post('/api/expenses', createExpense)
        .put('/api/expenses/:id', updateExpense)
        .delete('/api/expenses/:id', removeExpense)
        .get('/api/period-summary', summary),
    ),
  ),
)
let base = ''
const period = '?from=2026-10-01&to=2026-10-31'
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  origin?: string,
): Promise<Response> {
  return fetch(`${base}/api/${path}`, {
    method,
    headers: { origin: origin ?? base, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
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
  db.product.findUnique.mockResolvedValue({
    id,
    name: 'Pão atual',
    active: true,
    salePriceCents: 9000,
    unitCostCents: 100,
  })
  db.sale.findUnique.mockResolvedValue(sale)
  db.sale.findMany.mockResolvedValue([sale])
  db.sale.count.mockResolvedValue(1)
  db.sale.create.mockResolvedValue(sale)
  db.sale.update.mockResolvedValue(sale)
  db.expense.findMany.mockResolvedValue([expense])
  db.expense.count.mockResolvedValue(1)
  db.expense.create.mockResolvedValue(expense)
  db.expense.update.mockResolvedValue(expense)
  db.expense.delete.mockResolvedValue(expense)
})

describe('API de registros e preservação do histórico', () => {
  it('registra preços da operação e consulta valores históricos sem recalcular pelo produto', async () => {
    assert.equal((await request('sales', 'POST', saleInput)).status, 201)
    assert.equal(db.sale.create.mock.calls[0]?.[0].data.unitPriceCents, 1000)
    assert.equal(db.sale.create.mock.calls[0]?.[0].data.productNameSnapshot, 'Pão atual')
    const response = await request(`sales${period}&page=2`)
    const data = await response.json()
    assert.equal(response.status, 200)
    assert.equal(data.items[0].productNameSnapshot, 'Pão histórico')
    assert.equal(data.items[0].revenueCents, 2000)
    assert.equal(data.items[0].grossMarginPercent, 20)
    assert.equal(db.sale.findMany.mock.calls[0]?.[0].skip, 20)
    assert.equal(response.headers.get('cache-control'), 'no-store')
  })
  it('corrige venda mantendo snapshot do mesmo produto, inclusive inativo; troca explícita exige ativo', async () => {
    db.product.findUnique.mockResolvedValue({ id, active: false, name: 'Nome alterado' })
    assert.equal((await request(`sales/${id}`, 'PUT', { ...saleInput, quantity: 3 })).status, 200)
    assert.equal(db.product.findUnique.mock.calls.length, 0)
    assert.equal(db.sale.update.mock.calls[0]?.[0].data.productNameSnapshot, 'Pão histórico')
    assert.equal(
      (await request(`sales/${id}`, 'PUT', { ...saleInput, productId: otherId })).status,
      409,
    )
    assert.equal((await request('sales', 'POST', saleInput)).status, 409)
    db.product.findUnique.mockResolvedValue(null)
    assert.equal((await request('sales', 'POST', saleInput)).status, 404)
    db.sale.findUnique.mockResolvedValue(null)
    assert.equal((await request(`sales/${id}`, 'PUT', saleInput)).status, 404)
  })
  it('registra, consulta, corrige e remove despesas', async () => {
    assert.equal((await request('expenses', 'POST', expenseInput)).status, 201)
    assert.equal((await request(`expenses${period}`)).status, 200)
    assert.equal(
      (await request(`expenses/${id}`, 'PUT', { ...expenseInput, amountCents: 800 })).status,
      200,
    )
    assert.equal(db.expense.update.mock.calls[0]?.[0].data.amountCents, 800)
    assert.equal((await request(`expenses/${id}`, 'DELETE')).status, 204)
    db.expense.delete.mockRejectedValue({ code: 'P2025' })
    assert.equal((await request(`expenses/${id}`, 'DELETE')).status, 404)
  })
  it('resume todas as operações do período e rejeita overflow seguro', async () => {
    db.$queryRaw
      .mockResolvedValueOnce([
        { revenueCents: '2000', costCents: '1600', quantity: '2', saleCount: '1' },
      ])
      .mockResolvedValueOnce([{ expenseCents: '650' }])
    const response = await request(`period-summary${period}`)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).expenseRevenuePercent, 32.5)
    db.$queryRaw
      .mockResolvedValueOnce([
        { revenueCents: '9007199254740992', costCents: '0', quantity: '2', saleCount: '1' },
      ])
      .mockResolvedValueOnce([{ expenseCents: '0' }])
    assert.equal((await request(`period-summary${period}`)).status, 422)
  })
  it('não grava entradas inválidas e mantém a mesma barreira local em todos os endpoints', async () => {
    assert.equal((await request('sales', 'POST', { ...saleInput, quantity: 0 })).status, 400)
    assert.equal((await request(`sales/x`, 'PUT', saleInput)).status, 400)
    assert.equal(
      (await request('expenses', 'POST', { ...expenseInput, amountCents: -1 })).status,
      400,
    )
    assert.equal((await request('expenses')).status, 400)
    const routes: [string, string, unknown][] = [
      ['sales', 'POST', saleInput],
      [`sales/${id}`, 'PUT', saleInput],
      ['expenses', 'POST', expenseInput],
      [`expenses/${id}`, 'PUT', expenseInput],
      [`expenses/${id}`, 'DELETE', undefined],
      [`sales${period}`, 'GET', undefined],
      [`expenses${period}`, 'GET', undefined],
      [`period-summary${period}`, 'GET', undefined],
    ]
    vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'false')
    for (const [path, method, body] of routes) {
      assert.equal((await request(path, method, body)).status, 403)
    }
    vi.stubEnv('LOCAL_PRODUCTS_ENABLED', 'true')
    for (const [path, method, body] of routes.filter(([, method]) => method !== 'GET')) {
      assert.equal((await request(path, method, body, 'https://evil.example')).status, 403)
    }
    assert.equal(db.sale.create.mock.calls.length, 0)
    db.expense.create.mockRejectedValue(new Error('password=SECRETO'))
    const failure = await request('expenses', 'POST', expenseInput)
    assert.equal(failure.status, 503)
    assert.doesNotMatch(await failure.text(), /SECRETO|password/)
  })
})
