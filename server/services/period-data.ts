import { createError } from 'h3'
import { Prisma } from '../../generated/prisma/client.ts'
import type { DatePeriod } from '../../shared/types/suggestions.ts'
import type { PeriodTotals } from '../decision/operations.ts'
import { databaseTable } from '../utils/sql-table.ts'

export const periodTable = databaseTable

export async function readPeriodTotals(
  tx: Prisma.TransactionClient,
  period: DatePeriod,
): Promise<PeriodTotals> {
  const [sales] = await tx.$queryRaw<Omit<PeriodTotals, 'expenseCents'>[]>(Prisma.sql`
    SELECT COALESCE(SUM("quantity"::bigint * "unitPriceCents"), 0)::text AS "revenueCents",
           COALESCE(SUM("quantity"::bigint * "unitCostCents"), 0)::text AS "costCents",
           COALESCE(SUM("quantity"), 0)::text AS "quantity", COUNT(*)::text AS "saleCount"
    FROM ${periodTable('Sale')} WHERE "date" >= ${period.from}::date AND "date" <= ${period.to}::date`)
  const [expenses] = await tx.$queryRaw<{ expenseCents: string }[]>(Prisma.sql`
    SELECT COALESCE(SUM("amountCents"), 0)::text AS "expenseCents"
    FROM ${periodTable('Expense')} WHERE "date" >= ${period.from}::date AND "date" <= ${period.to}::date`)
  if (!sales || !expenses) {
    throw createError({ statusCode: 503, message: 'Resumo indisponível.' })
  }
  return { ...sales, ...expenses }
}
