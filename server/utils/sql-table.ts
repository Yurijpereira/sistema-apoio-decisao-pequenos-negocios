import { Prisma } from '../../generated/prisma/client.ts'

/** Somente nomes fechados; schema da configuração escapado, nunca de input HTTP. */
export function databaseTable(
  name: 'Sale' | 'Expense' | 'Product' | 'AdminLoginLimit' | 'AdminAccount' | 'AdminSession',
): Prisma.Sql {
  const schema = new URL(process.env.DATABASE_URL ?? '').searchParams.get('schema') ?? 'public'
  return Prisma.raw(`"${schema.replaceAll('"', '""')}"."${name}"`)
}
