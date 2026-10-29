import { createError, setHeader, type H3Event } from 'h3'
import { Prisma } from '../../generated/prisma/client.ts'
import { databaseOperation } from './database-operation.ts'
import { databaseTable } from './sql-table.ts'
import { getPrisma } from './prisma.ts'

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const MAX_LOGIN_ATTEMPTS = 5

/** Reserva atômica compartilhada por login e configuração inicial. */
export async function reserveLoginAttempt(event: H3Event): Promise<void> {
  const now = new Date()
  const [limit] = await databaseOperation(() =>
    getPrisma().$queryRaw<{ attempts: number; windowEndsAt: Date }[]>(Prisma.sql`
    INSERT INTO ${databaseTable('AdminLoginLimit')} AS limiter ("id", "attempts", "windowEndsAt")
    VALUES (1, 1, ${new Date(now.getTime() + LOGIN_WINDOW_MS)})
    ON CONFLICT ("id") DO UPDATE SET
      "attempts" = CASE WHEN limiter."windowEndsAt" <= ${now} THEN 1 ELSE LEAST(limiter."attempts" + 1, 6) END,
      "windowEndsAt" = CASE WHEN limiter."windowEndsAt" <= ${now} THEN EXCLUDED."windowEndsAt" ELSE limiter."windowEndsAt" END
    RETURNING "attempts", "windowEndsAt"`),
  )
  if (!limit) {
    throw createError({ statusCode: 503, message: 'Não foi possível verificar o acesso.' })
  }
  if (limit.attempts > MAX_LOGIN_ATTEMPTS) {
    setHeader(
      event,
      'Retry-After',
      Math.max(1, Math.ceil((limit.windowEndsAt.getTime() - now.getTime()) / 1000)),
    )
    throw createError({
      statusCode: 429,
      message: 'Muitas tentativas. Aguarde quinze minutos e tente novamente.',
    })
  }
}
