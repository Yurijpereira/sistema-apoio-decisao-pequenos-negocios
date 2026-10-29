import type { PrismaClient } from '../generated/prisma/client.ts'

export const DEMO_PRODUCT_ID = 'de000000-0000-4000-8000-000000000001'
export const DEMO_EXPENSE_ID = 'de000000-0000-4000-8000-000000000002'
export const DEMO_SALE_IDS = Array.from(
  { length: 6 },
  (_, index) => `de000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
)
/** Sem update/upsert: repetir nunca sobrescreve operações ou correções existentes. */
export async function seedDemo(db: PrismaClient): Promise<'created' | 'preserved'> {
  return db.$transaction(
    async (tx) => {
      const products = await tx.product.count({ where: { id: DEMO_PRODUCT_ID } })
      const sales = await tx.sale.count({ where: { id: { in: DEMO_SALE_IDS } } })
      const expenses = await tx.expense.count({ where: { id: DEMO_EXPENSE_ID } })
      if (products === 1 && sales === 6 && expenses === 1) {
        return 'preserved'
      }
      if (products + sales + expenses > 0) {
        throw new Error(
          'IDs da DEMO parcialmente ocupados. Nada foi alterado; confira os registros antes de preparar outra demonstração.',
        )
      }
      const period = {
        gte: new Date('2026-10-01T00:00:00Z'),
        lte: new Date('2026-10-14T00:00:00Z'),
      }
      if (
        (await tx.sale.count({ where: { date: period } })) > 0 ||
        (await tx.expense.count({ where: { date: period } })) > 0
      ) {
        throw new Error(
          'O período da DEMO já contém registros. Use um banco local exclusivo de demonstração; nada foi alterado.',
        )
      }
      const name = 'DEMO · Pão integral fictício'
      await tx.product.create({
        data: { id: DEMO_PRODUCT_ID, name, salePriceCents: 500, unitCostCents: 600 },
      })
      await tx.sale.createMany({
        data: DEMO_SALE_IDS.map((id, index) => ({
          id,
          productId: DEMO_PRODUCT_ID,
          productNameSnapshot: name,
          date: new Date(index < 3 ? '2026-10-01T00:00:00Z' : '2026-10-08T00:00:00Z'),
          quantity: [40, 30, 30, 25, 25, 25][index] ?? 25,
          unitPriceCents: 1000,
          unitCostCents: 800,
        })),
      })
      await tx.expense.create({
        data: {
          id: DEMO_EXPENSE_ID,
          date: new Date('2026-10-14T00:00:00Z'),
          category: 'DEMO · Energia fictícia',
          amountCents: 48750,
          description: 'Dado exclusivamente fictício para demonstração acadêmica.',
        },
      })
      return 'created'
    },
    { isolationLevel: 'Serializable' },
  )
}
