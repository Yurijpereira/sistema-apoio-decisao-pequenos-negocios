import type { H3Event } from 'h3'
import { assertLocalAccess } from './local-access.ts'
import { requireAdminSession } from './admin-session.ts'

/** Sessão não substitui a restrição de transporte local. Chamado por cada handler. */
export async function assertAdminAccess(event: H3Event): Promise<void> {
  assertLocalAccess(event)
  await requireAdminSession(event)
}
