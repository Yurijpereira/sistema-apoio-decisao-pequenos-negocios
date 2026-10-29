import { randomBytes } from 'node:crypto'
import { validLoginPassword } from '../../shared/utils/password.ts'
import {
  createError,
  deleteCookie,
  getCookie,
  getRequestURL,
  setCookie,
  setHeader,
  type H3Event,
} from 'h3'
import { databaseOperation } from './database-operation.ts'
import { equalDigest, tokenDigest, verifyPassword } from './password.ts'
import { requirePasswordHash } from './admin-account.ts'
import { reserveLoginAttempt } from './admin-login-limit.ts'
import { getPrisma } from './prisma.ts'

export const SESSION_COOKIE = 'visaoativa_session'
export const SESSION_SECONDS = 8 * 60 * 60
function incomingToken(event: H3Event): string | null {
  const token = getCookie(event, SESSION_COOKIE)
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null
}
function cookieOptions(event: H3Event) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure:
      getRequestURL(event, { xForwardedHost: false, xForwardedProto: false }).protocol === 'https:',
    path: '/',
  }
}
export async function sessionStatus(event: H3Event): Promise<{ authenticated: boolean }> {
  const hash = await requirePasswordHash()
  const token = incomingToken(event)
  if (!token) {
    return { authenticated: false }
  }
  const session = await databaseOperation(() =>
    getPrisma().adminSession.findUnique({ where: { id: 1 } }),
  )
  return {
    authenticated: Boolean(
      session &&
      session.expiresAt.getTime() > Date.now() &&
      equalDigest(session.tokenHash, tokenDigest(token)) &&
      equalDigest(session.credentialFingerprint, tokenDigest(hash)),
    ),
  }
}
export async function requireAdminSession(event: H3Event): Promise<void> {
  if (!(await sessionStatus(event)).authenticated) {
    throw createError({
      statusCode: 401,
      message: 'Entre com a conta administrativa para continuar.',
    })
  }
}

export async function signIn(event: H3Event, password: unknown): Promise<{ authenticated: true }> {
  const hash = await requirePasswordHash()
  const now = new Date()
  await reserveLoginAttempt(event)
  if (!validLoginPassword(password) || !(await verifyPassword(password, hash))) {
    throw createError({ statusCode: 401, message: 'Senha inválida.' })
  }
  const token = randomBytes(32).toString('base64url')
  const data = {
    tokenHash: tokenDigest(token),
    credentialFingerprint: tokenDigest(hash),
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_SECONDS * 1000),
  }
  await databaseOperation(async () => {
    await getPrisma().adminSession.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    })
    await getPrisma().adminLoginLimit.deleteMany({ where: { id: 1 } })
  })
  setCookie(event, SESSION_COOKIE, token, { ...cookieOptions(event), maxAge: SESSION_SECONDS })
  return { authenticated: true }
}
export async function signOut(event: H3Event): Promise<{ authenticated: false }> {
  const token = incomingToken(event)
  if (token) {
    await databaseOperation(() =>
      getPrisma().adminSession.deleteMany({ where: { id: 1, tokenHash: tokenDigest(token) } }),
    )
  }
  clearSessionCookie(event)
  return { authenticated: false }
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE, cookieOptions(event))
  setHeader(event, 'Cache-Control', 'no-store')
}
