import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPrisma } from '../server/utils/prisma.ts'
import { localTestServer, object, recordId } from './local-test-server.ts'

const { base, start, stop, cleanup, sessionCookie, api } = localTestServer(3106)
const db = getPrisma()
const sales: string[] = []

function suggestions(report: Record<string, unknown>): Record<string, unknown>[] {
  assert.ok(Array.isArray(report.suggestions))
  return report.suggestions.map(object)
}
try {
  await start()
  // Escolhe um intervalo vazio, sem modificar nem incluir dados preexistentes na demonstração.
  let year = 2025
  for (; year >= 2000; year--) {
    const where = {
      date: { gte: new Date(`${year}-10-01T00:00:00Z`), lte: new Date(`${year}-10-14T00:00:00Z`) },
    }
    if ((await db.sale.count({ where })) === 0 && (await db.expense.count({ where })) === 0) {
      break
    }
  }
  assert.ok(year >= 2000, 'Nenhum intervalo sintético vazio disponível.')
  const to = `${year}-10-14`
  const query = `?to=${to}&recordsComplete=true`
  const page = await fetch(`${base}/sugestoes`, { headers: { cookie: sessionCookie() } })
  assert.equal(page.status, 200)
  assert.match(await page.text(), /<h1\b[^>]*id="suggestions-title"[^>]*>[^<]+<\/h1>/)
  const product = await api(
    'products',
    'POST',
    { name: `DEMO decisões ${randomUUID()}`, salePriceCents: 500, unitCostCents: 600 },
    201,
  )
  const productId = recordId(product)
  const currentInputs = [25, 25, 25].map((quantity) => ({
    productId,
    date: `${year}-10-08`,
    quantity,
    unitPriceCents: 1000,
    unitCostCents: 800,
  }))
  for (const quantity of [40, 30, 30]) {
    sales.push(
      recordId(
        await api(
          'sales',
          'POST',
          { productId, date: `${year}-10-01`, quantity, unitPriceCents: 1000, unitCostCents: 800 },
          201,
        ),
      ),
    )
  }
  for (const input of currentInputs) {
    sales.push(recordId(await api('sales', 'POST', input, 201)))
  }
  const expenseId = recordId(
    await api(
      'expenses',
      'POST',
      {
        date: to,
        category: 'Z_DEMO',
        amountCents: 48750,
        description: 'Fixture sintética temporária da Etapa 3',
      },
      201,
    ),
  )
  const unconfirmed = suggestions(await api(`suggestions?to=${to}`))
  assert.ok(!unconfirmed.some((item) => item.ruleId !== 'BELOW_COST'))
  const before = await api(`suggestions${query}`)
  const initial = suggestions(before)
  for (const ruleId of ['BELOW_COST', 'LOW_MARGIN', 'EXPENSE_PRESSURE', 'SALES_DROP']) {
    assert.ok(initial.some((item) => item.ruleId === ruleId))
  }
  const low = initial.find(
    (item) => item.ruleId === 'LOW_MARGIN' && object(item.evidence).productId === productId,
  )
  assert.ok(low)
  assert.equal(object(low.evidence).grossMarginPercent, 20)
  assert.equal(
    object(initial.find((item) => item.ruleId === 'EXPENSE_PRESSURE')?.evidence)
      .expenseRevenuePercent,
    65,
  )
  assert.equal(
    object(initial.find((item) => item.ruleId === 'SALES_DROP')?.evidence).revenueChangePercent,
    -25,
  )
  await api(`products/${productId}`, 'PUT', {
    name: 'DEMO cadastro alterado',
    salePriceCents: 2000,
    unitCostCents: 100,
  })
  await api(`products/${productId}`, 'PATCH', { active: false })
  const afterCatalog = suggestions(await api(`suggestions${query}`))
  assert.ok(
    !afterCatalog.some(
      (item) => item.ruleId === 'BELOW_COST' && object(item.evidence).productId === productId,
    ),
  )
  assert.deepEqual(
    afterCatalog.find((item) => item.key === low.key),
    low,
  )
  const currentId = sales[3]
  assert.ok(currentId && currentInputs[0])
  const historical = await db.sale.findUniqueOrThrow({ where: { id: currentId } })
  assert.equal(historical.productNameSnapshot, product.name)
  assert.equal(historical.unitPriceCents, 1000)
  await api(`sales/${currentId}`, 'PUT', { ...currentInputs[0], unitPriceCents: 2000 })
  const afterSale = suggestions(await api(`suggestions${query}`))
  assert.ok(
    !afterSale.some(
      (item) => item.ruleId === 'LOW_MARGIN' && object(item.evidence).productId === productId,
    ),
  )
  assert.ok(
    !afterSale.some((item) => ['EXPENSE_PRESSURE', 'SALES_DROP'].includes(String(item.ruleId))),
  )
  const corrected = await db.sale.findUniqueOrThrow({ where: { id: currentId } })
  assert.equal(corrected.createdAt.toISOString(), historical.createdAt.toISOString())
  assert.equal(corrected.productNameSnapshot, product.name)
  await api(`expenses/${expenseId}`, 'PUT', {
    date: to,
    category: 'Z_DEMO',
    amountCents: 30000,
    description: null,
  })
  const secondExpense = recordId(
    await api(
      'expenses',
      'POST',
      { date: to, category: 'A_DEMO', amountCents: 30000, description: null },
      201,
    ),
  )
  const tie = suggestions(await api(`suggestions${query}`)).find(
    (item) => item.ruleId === 'EXPENSE_PRESSURE',
  )
  assert.ok(tie)
  assert.equal(object(tie.evidence).expenseRevenuePercent, 60)
  assert.equal(object(object(tie.evidence).topExpense).category, 'A_DEMO')
  await api(`expenses/${secondExpense}`, 'DELETE', undefined, 204)
  assert.ok(
    !suggestions(await api(`suggestions${query}`)).some(
      (item) => item.ruleId === 'EXPENSE_PRESSURE',
    ),
  )
  const persisted = await api(`suggestions${query}`)
  await stop()
  await start()
  assert.deepEqual(await api(`suggestions${query}`), persisted)
  // O mesmo limite seguro da Etapa 2 vale para a análise, sem arredondar totais.
  await api(`products/${productId}`, 'PATCH', { active: true })
  for (let i = 0; i < 5; i++) {
    recordId(
      await api(
        'sales',
        'POST',
        { productId, date: to, quantity: 1000000, unitPriceCents: 2147483647, unitCostCents: 0 },
        201,
      ),
    )
  }
  await api(`suggestions${query}`, 'GET', undefined, 422)
  const proxy = await fetch(`${base}/api/suggestions${query}`, {
    headers: { 'x-forwarded-for': '127.0.0.1' },
  })
  assert.equal(proxy.status, 403)
  await stop()
  await start(false)
  await api(`suggestions${query}`, 'GET', undefined, 403)
  console.log(
    `Etapa 3: PostgreSQL real, HTTP 200, quatro regras, 20%/65%/−25%, histórico preservado, correções alteram recomendações, empate de categoria, persistência, overflow e guard aprovados. Fixture: ${year}-10-01 a ${to}.`,
  )
} finally {
  await cleanup()
  console.log(
    'Servidor encerrado; schema temporário e fixtures removidos, sem alterar os dados/sessão do banco principal.',
  )
}
