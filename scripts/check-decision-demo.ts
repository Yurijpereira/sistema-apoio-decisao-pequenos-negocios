import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { DEMO_EXPENSE_ID, DEMO_PRODUCT_ID, DEMO_SALE_IDS, seedDemo } from './demo-data.ts'
import { getPrisma } from '../server/utils/prisma.ts'
import { localTestServer, object } from './local-test-server.ts'

const server = localTestServer(3114)
const db = getPrisma()
const query = 'suggestions?to=2026-10-14&recordsComplete=true'
function rules(report: Record<string, unknown>): string[] {
  assert.ok(Array.isArray(report.suggestions))
  return report.suggestions.map((item: unknown) => {
    const rule = object(item).ruleId
    assert.equal(typeof rule, 'string')
    return String(rule)
  })
}
function analysisStatuses(report: Record<string, unknown>): string[] {
  assert.ok(Array.isArray(report.analyses))
  return report.analyses.map((value: unknown) => {
    const status = object(value).status
    assert.equal(typeof status, 'string')
    return String(status)
  })
}
try {
  await server.start()
  const empty = await server.api(query)
  assert.deepEqual(analysisStatuses(empty), [
    'insufficient-data',
    'insufficient-data',
    'insufficient-data',
  ])
  const open = await server.api(`suggestions?to=${String(empty.asOfDate)}&recordsComplete=true`)
  assert.deepEqual(analysisStatuses(open), ['open-period', 'open-period', 'open-period'])
  assert.equal(await seedDemo(db), 'created')
  assert.equal(await seedDemo(db), 'preserved')
  assert.equal(await db.sale.count(), 6)
  const before = await server.api(query)
  assert.deepEqual(rules(before), ['BELOW_COST', 'LOW_MARGIN', 'EXPENSE_PRESSURE', 'SALES_DROP'])
  assert.deepEqual(analysisStatuses(before), ['attention', 'attention', 'attention'])
  const initialSummary = object(before.summary)
  assert.equal(initialSummary.revenueCents, 75000)
  assert.equal(initialSummary.costCents, 60000)
  assert.equal(initialSummary.grossMarginPercent, 20)
  assert.equal(initialSummary.expenseRevenuePercent, 65)
  const unconfirmed = await server.api('suggestions?to=2026-10-14')
  assert.deepEqual(rules(unconfirmed), ['BELOW_COST'])
  assert.deepEqual(analysisStatuses(unconfirmed), [
    'confirmation-required',
    'confirmation-required',
    'confirmation-required',
  ])

  await server.api(`expenses/${DEMO_EXPENSE_ID}`, 'PUT', {
    date: '2026-10-14',
    category: 'DEMO · Energia fictícia',
    amountCents: 30000,
    description: null,
  })
  const afterExpense = await server.api(query)
  assert.deepEqual(rules(afterExpense), ['BELOW_COST', 'LOW_MARGIN', 'SALES_DROP'])
  assert.equal(object(afterExpense.summary).expenseRevenuePercent, 40)
  assert.deepEqual(analysisStatuses(afterExpense), ['attention', 'no-alert', 'attention'])

  const saleId = DEMO_SALE_IDS[3]
  assert.ok(saleId)
  const sale = await db.sale.findUniqueOrThrow({ where: { id: saleId } })
  await server.api(`sales/${saleId}`, 'PUT', {
    productId: DEMO_PRODUCT_ID,
    date: '2026-10-08',
    quantity: 25,
    unitPriceCents: 2000,
    unitCostCents: 800,
  })
  const afterSale = await server.api(query)
  assert.deepEqual(rules(afterSale), ['BELOW_COST'])
  assert.deepEqual(analysisStatuses(afterSale), ['no-alert', 'no-alert', 'no-alert'])
  assert.equal(object(afterSale.summary).revenueCents, 100000)
  assert.equal(object(afterSale.summary).grossMarginPercent, 40)
  assert.equal(object(afterSale.summary).expenseRevenuePercent, 30)
  const corrected = await db.sale.findUniqueOrThrow({ where: { id: saleId } })
  assert.equal(corrected.createdAt.toISOString(), sale.createdAt.toISOString())
  assert.equal(corrected.productNameSnapshot, sale.productNameSnapshot)

  await server.api(`products/${DEMO_PRODUCT_ID}`, 'PUT', {
    name: 'DEMO · Pão integral fictício',
    salePriceCents: 1000,
    unitCostCents: 800,
  })
  const afterCatalog = await server.api(query)
  assert.deepEqual(rules(afterCatalog), [])
  assert.deepEqual(afterCatalog.summary, afterSale.summary)
  assert.equal(await seedDemo(db), 'preserved')
  assert.equal(
    (await db.expense.findUniqueOrThrow({ where: { id: DEMO_EXPENSE_ID } })).amountCents,
    30000,
  )
  assert.equal((await db.sale.findUniqueOrThrow({ where: { id: saleId } })).unitPriceCents, 2000)

  await mkdir('.local/reports/decision-demo', { recursive: true, mode: 0o700 })
  await writeFile(
    '.local/reports/decision-demo/scenario.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        empty,
        open,
        unconfirmed,
        before,
        afterExpense,
        afterSale,
        afterCatalog,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )
  // Uma carga parcial não pode recriar ou sobrescrever dados corrigidos.
  await db.expense.delete({ where: { id: DEMO_EXPENSE_ID } })
  await assert.rejects(() => seedDemo(db), /parcialmente ocupados/)
  assert.equal(await db.sale.count(), 6)
  assert.equal(await db.expense.count(), 0)
  assert.equal((await db.sale.findUniqueOrThrow({ where: { id: saleId } })).unitPriceCents, 2000)
  console.log(
    'PASS: estados explícitos sem dados/sem confirmação/semana aberta, cenário fictício no PostgreSQL e APIs reais; 20%/65%/−25%, correção de despesa retira somente pressão, correção de venda retira margem/queda, cadastro não recalcula histórico; seed idempotente e falha segura em carga parcial.',
  )
} finally {
  await server.cleanup()
}
