import assert from 'node:assert/strict'
import { afterEach, it, vi } from 'vitest'
import { databaseReady } from '../../server/utils/health.ts'

const db = vi.hoisted(() => ({ $queryRaw: vi.fn(), adminAccount: { findUnique: vi.fn() } }))
vi.mock('../../server/utils/prisma.ts', () => ({ getPrisma: () => db }))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

it('limita espera a 3s, compartilha consulta pendente e permite recuperação', async () => {
  vi.stubEnv('ADMIN_PASSWORD_HASH', `scrypt:131072:8:1:${'a'.repeat(32)}:${'b'.repeat(128)}`)
  vi.useFakeTimers()
  let resolve: (value: unknown) => void = () => {}
  db.$queryRaw.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const first = databaseReady()
  const second = databaseReady()
  await vi.advanceTimersByTimeAsync(3000)
  assert.deepEqual(await Promise.all([first, second]), [false, false])
  const third = databaseReady()
  assert.equal(db.$queryRaw.mock.calls.length, 1)
  resolve([{ ok: 1 }])
  assert.equal(await third, true)
  db.$queryRaw.mockResolvedValueOnce([{ ok: 1 }])
  assert.equal(await databaseReady(), true)
  assert.equal(db.$queryRaw.mock.calls.length, 2)
})
