import { getPrisma } from './prisma.ts'
import { requirePasswordHash } from './admin-account.ts'

let pending: Promise<boolean> | undefined

/** Uma consulta em voo; timeout da resposta não enfileira novas consultas. */
export async function databaseReady(): Promise<boolean> {
  if (!pending) {
    pending = Promise.resolve()
      .then(async () => {
        await getPrisma().$queryRaw`SELECT 1 AS ok`
        await requirePasswordHash()
      })
      .then(
        () => true,
        () => false,
      )
      .finally(() => {
        pending = undefined
      })
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      pending,
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), 3000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
