import { databaseOperation } from '../utils/database-operation.ts'
import { createError } from 'h3'
import type { Product } from '../../generated/prisma/client.ts'
import { Prisma } from '../../generated/prisma/client.ts'
import { databaseTable } from '../utils/sql-table.ts'
import {
  PRODUCT_PAGE_SIZE,
  type ProductInput,
  type ProductList,
  type ProductQuery,
  type ProductView,
} from '../../shared/types/product.ts'
import { calculateGrossMarginPercent } from '../decision/metrics.ts'
import { evaluateLowMargin } from '../decision/rules.ts'
import { getPrisma } from '../utils/prisma.ts'

function toProductView(product: Product): ProductView {
  return {
    ...product,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    grossMarginPercent: calculateGrossMarginPercent(product.salePriceCents, product.unitCostCents),
    lowMargin: product.active
      ? evaluateLowMargin({
          productName: product.name,
          unitPriceCents: product.salePriceCents,
          unitCostCents: product.unitCostCents,
        })
      : null,
  }
}

export async function listProducts(query: ProductQuery): Promise<ProductList> {
  const { items, total } = await databaseOperation(async () => {
    const db = getPrisma()
    if (query.search) {
      // Normalização latina nativa do PostgreSQL, sem extensão ou alteração dos nomes.
      // strpos trata %, _ e aspas como texto literal, nunca como padrões ou SQL.
      const filter = Prisma.sql`WHERE
        (${query.status} = 'all' OR "active" = ${query.status === 'active'})
        AND strpos(
          regexp_replace(normalize(lower("name"), NFD), ${'[\u0300-\u036f]'}, '', 'g'),
          regexp_replace(normalize(lower(${query.search}::text), NFD), ${'[\u0300-\u036f]'}, '', 'g')
        ) > 0`
      const [items, counts] = await Promise.all([
        db.$queryRaw<
          Product[]
        >`SELECT "id", "name", "salePriceCents", "unitCostCents", "active", "createdAt", "updatedAt"
          FROM ${databaseTable('Product')} ${filter}
          ORDER BY "createdAt" DESC, "id" DESC
          LIMIT ${PRODUCT_PAGE_SIZE} OFFSET ${(query.page - 1) * PRODUCT_PAGE_SIZE}`,
        db.$queryRaw<
          { total: string }[]
        >`SELECT COUNT(*)::text AS total FROM ${databaseTable('Product')} ${filter}`,
      ])
      const total = Number(counts[0]?.total ?? '0')
      if (!Number.isSafeInteger(total) || total < 0) {
        throw new Error('Contagem de produtos inválida.')
      }
      return { items, total }
    }
    const where = query.status === 'all' ? {} : { active: query.status === 'active' }
    const [items, total] = await Promise.all([
      db.product.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PRODUCT_PAGE_SIZE,
        skip: (query.page - 1) * PRODUCT_PAGE_SIZE,
      }),
      db.product.count({ where }),
    ])
    return { items, total }
  })
  return { items: items.map(toProductView), total, page: query.page, pageSize: PRODUCT_PAGE_SIZE }
}

export async function getProduct(id: string): Promise<ProductView> {
  const product = await databaseOperation(() => getPrisma().product.findUnique({ where: { id } }))
  if (!product) {
    throw createError({ statusCode: 404, message: 'Produto não encontrado.' })
  }
  return toProductView(product)
}

export async function createProduct(input: ProductInput): Promise<ProductView> {
  return toProductView(await databaseOperation(() => getPrisma().product.create({ data: input })))
}

export async function updateProduct(
  id: string,
  input: ProductInput | { active: boolean },
): Promise<ProductView> {
  return toProductView(
    await databaseOperation(() => getPrisma().product.update({ where: { id }, data: input })),
  )
}
