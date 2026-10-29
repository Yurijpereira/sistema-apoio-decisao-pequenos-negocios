import { createError } from 'h3'
import { Prisma } from '../../generated/prisma/client.ts'
import type {
  CatalogPrice,
  ExpenseCategory,
  ProductSales,
  SuggestionQuery,
  SuggestionReport,
} from '../../shared/types/suggestions.ts'
import { safeAggregateInteger, summarizePeriod } from '../decision/operations.ts'
import { analyzeSuggestions, comparisonPeriods } from '../decision/suggestions.ts'
import { databaseOperation } from '../utils/database-operation.ts'
import { getPrisma } from '../utils/prisma.ts'
import { periodTable, readPeriodTotals } from './period-data.ts'

type ProductRow = {
  productId: string
  productName: string
  revenueCents: string
  costCents: string
  quantity: string
  saleCount: string
}
const MAX_ANALYZED_PRODUCTS = 100

export async function getSuggestions(
  query: SuggestionQuery,
  asOfDate: string,
): Promise<SuggestionReport> {
  const periods = comparisonPeriods(query.to)
  const data = await databaseOperation(() =>
    getPrisma().$transaction(
      async (tx) => {
        const current = await readPeriodTotals(tx, periods.current)
        const previous = await readPeriodTotals(tx, periods.previous)
        const products = await tx.$queryRaw<ProductRow[]>(Prisma.sql`
      SELECT s."productId",
             (SELECT "productNameSnapshot" FROM ${periodTable('Sale')}
              WHERE "productId" = s."productId" AND "date" >= ${periods.current.from}::date AND "date" <= ${periods.current.to}::date
              ORDER BY "date" DESC, "id" DESC LIMIT 1) AS "productName",
             SUM(s."quantity"::bigint * s."unitPriceCents")::text AS "revenueCents",
             SUM(s."quantity"::bigint * s."unitCostCents")::text AS "costCents",
             SUM(s."quantity")::text AS "quantity", COUNT(*)::text AS "saleCount"
      FROM ${periodTable('Sale')} s WHERE s."date" >= ${periods.current.from}::date AND s."date" <= ${periods.current.to}::date
      GROUP BY s."productId" ORDER BY s."productId" LIMIT ${MAX_ANALYZED_PRODUCTS + 1}`)
        const belowCostProducts = await tx.$queryRaw<CatalogPrice[]>(Prisma.sql`
      SELECT "id" AS "productId", "name" AS "productName", "salePriceCents" AS "unitPriceCents", "unitCostCents"
      FROM ${periodTable('Product')} WHERE "active" = true AND "salePriceCents" <= "unitCostCents"
      ORDER BY "id" LIMIT ${MAX_ANALYZED_PRODUCTS + 1}`)
        const topExpenses = await tx.$queryRaw<
          { category: string; amountCents: string }[]
        >(Prisma.sql`
      SELECT "category", SUM("amountCents")::text AS "amountCents" FROM ${periodTable('Expense')}
      WHERE "date" >= ${periods.current.from}::date AND "date" <= ${periods.current.to}::date
      GROUP BY "category" ORDER BY SUM("amountCents") DESC, "category" COLLATE "C" ASC LIMIT 1`)
        if (
          products.length > MAX_ANALYZED_PRODUCTS ||
          belowCostProducts.length > MAX_ANALYZED_PRODUCTS
        ) {
          throw createError({
            statusCode: 422,
            message:
              'A análise está limitada a 100 produtos vendidos na semana e 100 avisos de cadastro. Nenhuma análise parcial foi retornada.',
          })
        }
        return {
          current,
          previous,
          products,
          belowCostProducts,
          topExpense: topExpenses[0] ?? null,
        }
      },
      { isolationLevel: 'RepeatableRead' },
    ),
  )
  try {
    const products: ProductSales[] = data.products.map((product) => ({
      ...product,
      revenueCents: safeAggregateInteger(product.revenueCents),
      costCents: safeAggregateInteger(product.costCents),
      quantity: safeAggregateInteger(product.quantity),
      saleCount: safeAggregateInteger(product.saleCount),
    }))
    const topExpense: ExpenseCategory | null = data.topExpense
      ? {
          category: data.topExpense.category,
          amountCents: safeAggregateInteger(data.topExpense.amountCents),
        }
      : null
    return analyzeSuggestions({
      ...query,
      asOfDate,
      current: summarizePeriod(data.current),
      previous: summarizePeriod(data.previous),
      products,
      topExpense,
      belowCostProducts: data.belowCostProducts,
    })
  } catch {
    throw createError({
      statusCode: 422,
      message:
        'Dados inválidos ou totais acima do limite seguro. Confira os registros e selecione outra semana.',
    })
  }
}
