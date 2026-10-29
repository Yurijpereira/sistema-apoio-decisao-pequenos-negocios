import { PrismaPg } from '@prisma/adapter-pg'
import { createError } from 'h3'
import { PrismaClient } from '../../generated/prisma/client.ts'

let client: PrismaClient | undefined

export function getPrisma(): PrismaClient {
  if (client) {
    return client
  }
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw createError({
      statusCode: 503,
      message: 'Banco de dados indisponível. Confira a configuração local.',
    })
  }
  const adapter = new PrismaPg(
    { connectionString, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 },
    { schema: new URL(connectionString).searchParams.get('schema') ?? 'public' },
  )
  client = new PrismaClient({ adapter })
  return client
}
