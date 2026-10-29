import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Gerar/validar o schema não exige conexão. Operações de banco exigem a URL.
  datasource: { url: process.env.DATABASE_URL ?? '' },
})
