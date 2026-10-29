import { createError, type H3Event } from 'h3'
import { Prisma } from '../../generated/prisma/client.ts'
import { databaseOperation } from './database-operation.ts'
import { getPrisma } from './prisma.ts'
import {
  equalDigest,
  hashPassword,
  tokenDigest,
  validPassword,
  validPasswordHash,
} from './password.ts'
import { reserveLoginAttempt } from './admin-login-limit.ts'
import { databaseTable } from './sql-table.ts'

/** Uma troca autenticada pode substituir a credencial externa enquanto sua configuração não mudar. */
export async function configuredPasswordHash(
  client: Pick<Prisma.TransactionClient, 'adminAccount'> = getPrisma(),
): Promise<string | null> {
  const external = process.env.ADMIN_PASSWORD_HASH
  if (external) {
    if (!validPasswordHash(external)) {
      throw createError({ statusCode: 503, message: 'Configuração de acesso indisponível.' })
    }
  }
  const account = await databaseOperation(() =>
    client.adminAccount.findUnique({ where: { id: 1 } }),
  )
  if (
    external &&
    (!account?.environmentFingerprint ||
      !equalDigest(account.environmentFingerprint, tokenDigest(external)))
  ) {
    return external
  }
  if (!account) {
    return null
  }
  if (!validPasswordHash(account.passwordHash)) {
    throw createError({ statusCode: 503, message: 'Configuração de acesso indisponível.' })
  }
  return account.passwordHash
}

export async function requirePasswordHash(): Promise<string> {
  const hash = await configuredPasswordHash()
  if (!hash) {
    throw createError({
      statusCode: 503,
      message: 'Configure a conta administrativa no primeiro acesso.',
    })
  }
  return hash
}

export async function setupAdminAccount(
  event: H3Event,
  password: unknown,
  confirmation: unknown,
): Promise<{ configured: true }> {
  if (await configuredPasswordHash()) {
    throw createError({ statusCode: 409, message: 'A conta administrativa já está configurada.' })
  }
  await reserveLoginAttempt(event)
  if (!validPassword(password)) {
    throw createError({
      statusCode: 400,
      message: 'Use uma senha de 15 a 128 caracteres, sem controles.',
    })
  }
  if (password !== confirmation) {
    throw createError({ statusCode: 400, message: 'A confirmação deve ser igual à senha.' })
  }
  const hash = await hashPassword(password)
  // A chave única e DO NOTHING impedem sobrescrita mesmo entre processos concorrentes.
  const inserted = await databaseOperation(() =>
    getPrisma().$queryRaw<{ id: number }[]>(Prisma.sql`
      INSERT INTO ${databaseTable('AdminAccount')} ("id", "passwordHash")
      VALUES (1, ${hash}) ON CONFLICT ("id") DO NOTHING RETURNING "id"`),
  )
  if (inserted.length === 0) {
    throw createError({ statusCode: 409, message: 'A conta administrativa já está configurada.' })
  }
  return { configured: true }
}
