import { databaseTable } from '../server/utils/sql-table.ts'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPrisma } from '../server/utils/prisma.ts'
import { localTestServer, object, recordId } from './local-test-server.ts'

const { base, start, stop, cleanup, sessionCookie, api } = localTestServer(3104)
const db = getPrisma()

const period = '?from=2026-10-01&to=2026-10-31'
try {
  await start()
  const page = await fetch(`${base}/registros`, { headers: { cookie: sessionCookie() } })
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Vendas e despesas/)
  const product = await api(
    'products',
    'POST',
    { name: `DEMO histórico ${randomUUID()}`, salePriceCents: 1000, unitCostCents: 800 },
    201,
  )
  const productId = recordId(product)
  const input = {
    productId,
    date: '2026-10-15',
    quantity: 2,
    unitPriceCents: 1000,
    unitCostCents: 800,
  }
  const original = await api('sales', 'POST', input, 201)
  const saleId = recordId(original)
  assert.equal(original.revenueCents, 2000)
  await api(`products/${productId}`, 'PUT', {
    name: `DEMO renomeado ${randomUUID()}`,
    salePriceCents: 9000,
    unitCostCents: 100,
  })
  await api(`products/${productId}`, 'PATCH', { active: false })
  await api('sales', 'POST', input, 409)
  const stored = await db.sale.findUniqueOrThrow({ where: { id: saleId } })
  assert.equal(stored.unitPriceCents, 1000)
  assert.equal(stored.unitCostCents, 800)
  assert.equal(stored.productNameSnapshot, product.name)
  const corrected = await api(`sales/${saleId}`, 'PUT', { ...input, quantity: 3 })
  assert.equal(corrected.revenueCents, 3000)
  assert.equal(corrected.productNameSnapshot, product.name)
  assert.equal(corrected.createdAt, original.createdAt)
  console.log(
    'PASS: alterar nome/preço/custo e desativar produto não altera snapshots; correção da quantidade preserva os valores históricos.',
  )

  const expense = await api(
    'expenses',
    'POST',
    { date: input.date, category: 'DEMO Energia', description: null, amountCents: 650 },
    201,
  )
  const expenseId = recordId(expense)
  const before = await api(`period-summary${period}`)
  // Comparações por diferença respeitam quaisquer registros existentes no período.
  await api(`expenses/${expenseId}`, 'PUT', {
    date: input.date,
    category: 'DEMO Energia corrigida',
    description: 'Sintético',
    amountCents: 1000,
  })
  const after = await api(`period-summary${period}`)
  assert.equal(Number(after.expenseCents) - Number(before.expenseCents), 350)
  await api(`expenses/${expenseId}`, 'DELETE', undefined, 204)
  const removed = await api(`period-summary${period}`)
  assert.equal(Number(after.expenseCents) - Number(removed.expenseCents), 1000)
  console.log('PASS: adicionar/corrigir/remover despesa muda os totais imediatamente pela API.')

  await stop()
  await start()
  const persisted = await db.sale.findUniqueOrThrow({ where: { id: saleId } })
  assert.equal(persisted.unitPriceCents, 1000)
  const list = await api(`sales${period}`)
  assert.ok(Number(list.total) >= 1)
  await assert.rejects(() => db.product.delete({ where: { id: productId } }))
  await assert.rejects(
    () =>
      db.$executeRaw`UPDATE ${databaseTable('Sale')} SET "quantity" = 0 WHERE "id" = ${saleId}::uuid`,
  )
  await assert.rejects(
    () =>
      db.$executeRaw`UPDATE ${databaseTable('Sale')} SET "unitCostCents" = -1 WHERE "id" = ${saleId}::uuid`,
  )
  const deletion = await fetch(`${base}/api/sales/${saleId}`, {
    method: 'DELETE',
    headers: { origin: base, 'content-type': 'application/json' },
  })
  assert.ok([404, 405].includes(deletion.status))

  // Período isolado para limites: não altera nem apaga registros preexistentes.
  await api(`products/${productId}`, 'PATCH', { active: true })
  const isolated = '?from=0099-12-31&to=0099-12-31'
  const initial = await api(`period-summary${isolated}`)
  for (let index = 0; index < 5; index++) {
    const large = await api(
      'sales',
      'POST',
      {
        ...input,
        date: '0099-12-31',
        quantity: 1000000,
        unitPriceCents: 2147483647,
        unitCostCents: 0,
      },
      201,
    )
    recordId(large)
    assert.equal(large.date, '0099-12-31')
  }
  await api(`period-summary${isolated}`, 'GET', undefined, 422)
  assert.ok(Number(initial.revenueCents) >= 0)
  const beforeMove = await api(`period-summary${period}`)
  await api(`sales/${saleId}`, 'PUT', { ...input, quantity: 3, date: '2026-11-01' })
  const afterMove = await api(`period-summary${period}`)
  assert.equal(Number(beforeMove.revenueCents) - Number(afterMove.revenueCents), 3000)
  const exactDate = await api('sales?from=2026-11-01&to=2026-11-01')
  assert.ok(
    Array.isArray(exactDate.items) &&
      exactDate.items.some((item: unknown) => object(item).id === saleId),
  )
  console.log(
    'PASS: persistência após reinício, FK RESTRICT, constraints, ausência de DELETE de vendas, data civil e rejeição de total inseguro.',
  )
  const pagedPeriod = '?from=0098-12-31&to=0098-12-31'
  const beforePages = await api(`period-summary${pagedPeriod}`)
  await api(`products/${productId}`, 'PATCH', { active: true })
  for (let index = 0; index < 21; index++) {
    recordId(
      await api(
        'sales',
        'POST',
        { ...input, date: '0098-12-31', quantity: 1, unitPriceCents: 1, unitCostCents: 0 },
        201,
      ),
    )
  }
  const firstPage = await api(`sales${pagedPeriod}`)
  assert.ok(Array.isArray(firstPage.items) && firstPage.items.length === 20)
  const secondPage = await api(`sales${pagedPeriod}&page=2`)
  assert.ok(Array.isArray(secondPage.items) && secondPage.items.length >= 1)
  const afterPages = await api(`period-summary${pagedPeriod}`)
  assert.equal(Number(afterPages.revenueCents) - Number(beforePages.revenueCents), 21)
  console.log(
    'PASS: intervalo inclusivo, correção de data move o indicador e totais incluem registros além da primeira página.',
  )

  await stop()
  await start(false)
  for (const path of [`sales${period}`, `expenses${period}`, `period-summary${period}`]) {
    await api(path, 'GET', undefined, 403)
  }
  console.log('PASS: novos endpoints fechados sem habilitação local.')
} finally {
  await cleanup()
  console.log(
    'Servidor encerrado; schema temporário e fixtures removidos, sem alterar os dados/sessão do banco principal.',
  )
}
