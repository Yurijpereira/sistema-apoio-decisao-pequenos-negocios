import { createError } from 'h3'
import type { Expense, Sale } from '../../generated/prisma/client.ts'
import {
  RECORD_PAGE_SIZE,
  type ExpenseInput,
  type ExpenseView,
  type PeriodQuery,
  type PeriodSummary,
  type RecordList,
  type SaleInput,
  type SaleView,
} from '../../shared/types/operations.ts'
import { saleAmounts, summarizePeriod } from '../decision/operations.ts'
import { databaseOperation } from '../utils/database-operation.ts'
import { getPrisma } from '../utils/prisma.ts'
import { readPeriodTotals } from './period-data.ts'

function saleView(sale: Sale): SaleView {
  return {
    ...sale,
    date: sale.date.toISOString().slice(0, 10),
    createdAt: sale.createdAt.toISOString(),
    updatedAt: sale.updatedAt.toISOString(),
    ...saleAmounts(sale),
  }
}
function expenseView(expense: Expense): ExpenseView {
  return {
    ...expense,
    date: expense.date.toISOString().slice(0, 10),
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  }
}
function dateFilter(query: PeriodQuery): { gte: Date; lte: Date } {
  return { gte: new Date(`${query.from}T00:00:00Z`), lte: new Date(`${query.to}T00:00:00Z`) }
}

export async function listSales(query: PeriodQuery): Promise<RecordList<SaleView>> {
  return databaseOperation(async () => {
    const db = getPrisma()
    const where = { date: dateFilter(query) }
    const [items, total] = await Promise.all([
      db.sale.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: RECORD_PAGE_SIZE,
        skip: (query.page - 1) * RECORD_PAGE_SIZE,
      }),
      db.sale.count({ where }),
    ])
    return { items: items.map(saleView), total, page: query.page, pageSize: RECORD_PAGE_SIZE }
  })
}

export async function saveSale(input: SaleInput, id?: string): Promise<SaleView> {
  const saved = await databaseOperation(() =>
    getPrisma().$transaction(async (tx) => {
      const previous = id ? await tx.sale.findUnique({ where: { id } }) : null
      if (id && !previous) {
        throw createError({ statusCode: 404, message: 'Venda não encontrada.' })
      }
      let productNameSnapshot = previous?.productNameSnapshot
      // Corrigir a mesma venda nunca relê os preços/custos/nome atuais do produto.
      if (!previous || previous.productId !== input.productId) {
        const product = await tx.product.findUnique({ where: { id: input.productId } })
        if (!product) {
          throw createError({ statusCode: 404, message: 'Produto não encontrado.' })
        }
        if (!product.active) {
          throw createError({
            statusCode: 409,
            message:
              'Selecione um produto ativo para registrar uma nova venda ou trocar o produto.',
          })
        }
        productNameSnapshot = product.name
      }
      if (!productNameSnapshot) {
        throw createError({ statusCode: 409, message: 'Nome do produto indisponível.' })
      }
      const data = { ...input, productNameSnapshot, date: new Date(`${input.date}T00:00:00Z`) }
      return id ? tx.sale.update({ where: { id }, data }) : tx.sale.create({ data })
    }),
  )
  return saleView(saved)
}

export async function listExpenses(query: PeriodQuery): Promise<RecordList<ExpenseView>> {
  return databaseOperation(async () => {
    const db = getPrisma()
    const where = { date: dateFilter(query) }
    const [items, total] = await Promise.all([
      db.expense.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: RECORD_PAGE_SIZE,
        skip: (query.page - 1) * RECORD_PAGE_SIZE,
      }),
      db.expense.count({ where }),
    ])
    return { items: items.map(expenseView), total, page: query.page, pageSize: RECORD_PAGE_SIZE }
  })
}
export async function saveExpense(input: ExpenseInput, id?: string): Promise<ExpenseView> {
  const data = { ...input, date: new Date(`${input.date}T00:00:00Z`) }
  const saved = await databaseOperation(() =>
    id ? getPrisma().expense.update({ where: { id }, data }) : getPrisma().expense.create({ data }),
  )
  return expenseView(saved)
}
export async function deleteExpense(id: string): Promise<void> {
  await databaseOperation(() => getPrisma().expense.delete({ where: { id } }))
}

export async function getPeriodSummary(query: PeriodQuery): Promise<PeriodSummary> {
  const totals = await databaseOperation(() =>
    getPrisma().$transaction((tx) => readPeriodTotals(tx, query), {
      isolationLevel: 'RepeatableRead',
    }),
  )
  try {
    return summarizePeriod(totals)
  } catch {
    throw createError({
      statusCode: 422,
      message: 'Os totais excedem o limite seguro de cálculo. Reduza o período.',
    })
  }
}
