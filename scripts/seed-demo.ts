import { getPrisma } from '../server/utils/prisma.ts'
import { seedDemo } from './demo-data.ts'

const url = new URL(process.env.DATABASE_URL ?? '')
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
  throw new Error('A demonstração só pode ser criada em PostgreSQL local.')
}
const db = getPrisma()
try {
  const result = await seedDemo(db)
  console.log(
    result === 'created'
      ? 'DEMO fictícia criada: 1 produto, 6 vendas e 1 despesa. Analise 08–14/10/2026 e compare com 01–07/10/2026; confira e confirme os registros.'
      : 'DEMO já existente. Todos os valores/correções foram preservados; nenhum registro sobrescrito.',
  )
} finally {
  await db.$disconnect()
}
