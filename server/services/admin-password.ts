import { createError, getCookie, type H3Event } from 'h3'
import { Prisma } from '../../generated/prisma/client.ts'
import { validLoginPassword, validNewPassword } from '../../shared/utils/password.ts'
import { configuredPasswordHash, requirePasswordHash } from '../utils/admin-account.ts'
import { reserveLoginAttempt } from '../utils/admin-login-limit.ts'
import { clearSessionCookie, SESSION_COOKIE } from '../utils/admin-session.ts'
import { databaseOperation } from '../utils/database-operation.ts'
import { hashPassword, tokenDigest, verifyPassword } from '../utils/password.ts'
import { getPrisma } from '../utils/prisma.ts'
import { databaseTable } from '../utils/sql-table.ts'

export async function changeAdminPassword(
  event: H3Event,
  input: Record<string, unknown>,
): Promise<{ authenticated: false }> {
  const { currentPassword, password, confirmation } = input
  if (!validLoginPassword(currentPassword) || !validNewPassword(password)) {
    throw createError({
      statusCode: 400,
      message: 'Informe a senha atual e uma nova senha de 15 a 128 caracteres, sem controles.',
    })
  }
  if (password !== confirmation || password === currentPassword) {
    throw createError({ statusCode: 400, message: 'Confirme uma nova senha diferente da atual.' })
  }
  await reserveLoginAttempt(event)
  const hash = await requirePasswordHash()
  if (!(await verifyPassword(currentPassword, hash))) {
    throw createError({ statusCode: 401, message: 'Não foi possível confirmar o acesso.' })
  }
  const newHash = await hashPassword(password)
  const token = getCookie(event, SESSION_COOKIE)
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw createError({ statusCode: 401, message: 'Entre novamente para alterar sua senha.' })
  }
  const external = process.env.ADMIN_PASSWORD_HASH
  const environmentFingerprint = external ? tokenDigest(external) : null
  await databaseOperation(() =>
    getPrisma().$transaction(async (tx) => {
      // Serializa trocas da mesma sessão e revalida após os hashes, fora da transação.
      const locked = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`
      SELECT "id" FROM ${databaseTable('AdminSession')}
      WHERE "id" = 1 AND "tokenHash" = ${tokenDigest(token)}
      AND "credentialFingerprint" = ${tokenDigest(hash)} AND "expiresAt" > ${new Date()}
      FOR UPDATE`)
      if (locked.length !== 1 || (await configuredPasswordHash(tx)) !== hash) {
        throw createError({ statusCode: 401, message: 'Entre novamente para alterar sua senha.' })
      }
      await tx.adminAccount.upsert({
        where: { id: 1 },
        create: { id: 1, passwordHash: newHash, environmentFingerprint },
        update: { passwordHash: newHash, environmentFingerprint },
      })
      await tx.adminSession.deleteMany({ where: { id: 1 } })
      await tx.adminLoginLimit.deleteMany({ where: { id: 1 } })
    }),
  )
  clearSessionCookie(event)
  return { authenticated: false }
}
