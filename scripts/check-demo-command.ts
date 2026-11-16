import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { setTimeout } from 'node:timers/promises'
import { getPrisma } from '../server/utils/prisma.ts'
import { DEMO_EXPENSE_ID } from './demo-data.ts'
import { object } from './local-test-server.ts'

// Somente leitura no schema original; todas as gravações são feitas pela demo isolada.
const connection = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname))
const db = getPrisma()
const base = 'http://127.0.0.1:3001'
const analysisPath = '/api/suggestions?to=2026-10-14&recordsComplete=true'
interface DemoProcess {
  child: ChildProcess
  output: () => string
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
}
function launch(): DemoProcess {
  const child = spawn(process.execPath, ['scripts/demo-local.ts'], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout?.on('data', (data: Buffer) => {
    output += data.toString()
  })
  child.stderr?.on('data', (data: Buffer) => {
    output += data.toString()
  })
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve({ code, signal }))
    },
  )
  return { child, output: () => output, exited }
}
async function deadline<T>(operation: Promise<T>): Promise<T> {
  return Promise.race([
    operation,
    setTimeout(15000, undefined, { ref: false }).then(() => {
      throw new Error('Comando demo excedeu o prazo de encerramento.')
    }),
  ])
}
async function ready(demo: DemoProcess): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (
      demo.output().includes(`${base}/sugestoes?to=2026-10-14`) &&
      demo.output().includes('Ctrl+C')
    ) {
      return
    }
    assert.ok(
      demo.child.exitCode === null && demo.child.signalCode === null,
      'Demo encerrou antes de ficar disponível.',
    )
    await setTimeout(100)
  }
  throw new Error('Comando demo não ficou disponível no prazo esperado.')
}
async function stop(demo: DemoProcess, signal: 'SIGINT' | 'SIGTERM'): Promise<void> {
  if (demo.child.exitCode === null && demo.child.signalCode === null) {
    demo.child.kill(signal)
  }
  assert.deepEqual(await deadline(demo.exited), { code: 0, signal: null })
}
async function schemas(): Promise<string[]> {
  const rows = await db.$queryRaw<
    { schema_name: string }[]
  >`SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'visaoativa_test_%' ORDER BY schema_name`
  return rows.map((row) => row.schema_name)
}
async function report(): Promise<Record<string, unknown>> {
  const response = await fetch(base + analysisPath, { signal: AbortSignal.timeout(10000) })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const value: unknown = await response.json()
  return object(value)
}
function newSchema(before: string[], after: string[]): string {
  assert.ok(
    before.every((name) => after.includes(name)),
    'Schema preexistente deve ser preservado.',
  )
  const created = after.filter((name) => !before.includes(name))
  assert.equal(created.length, 1, 'A demo deve criar exatamente um schema próprio.')
  const schema = created[0]
  assert.ok(schema)
  assert.match(schema, /^visaoativa_test_[a-f0-9]{32}$/)
  return schema
}
const processes: DemoProcess[] = []
try {
  // Uma demo já aberta não pode ser confundida com o processo sob teste.
  const port = createServer()
  try {
    port.listen(3001, '127.0.0.1')
    await once(port, 'listening')
  } catch {
    throw new Error('Encerre a demonstração na porta 3001 antes de executar este teste.')
  } finally {
    if (port.listening) {
      await new Promise<void>((resolve) => port.close(() => resolve()))
    }
  }
  const before = await schemas()
  const first = launch()
  processes.push(first)
  await ready(first)
  const firstSchema = newSchema(before, await schemas())
  const initial = await report()
  assert.equal(object(initial.summary).grossMarginPercent, 20)
  assert.equal(object(initial.summary).expenseRevenuePercent, 65)
  assert.equal(object(initial.previousSummary).revenueCents, 100000)
  assert.ok(Array.isArray(initial.suggestions))
  assert.equal(initial.suggestions.length, 4)
  assert.match(first.output(), /Roteiro de demonstração/)
  assert.doesNotMatch(first.output(), /postgresql:\/\/|password=|scrypt:/i)

  // Porta ocupada: falha segura, sem alterar a primeira demo ou deixar outro schema.
  const collision = launch()
  processes.push(collision)
  assert.deepEqual(await deadline(collision.exited), { code: 1, signal: null })
  assert.match(collision.output(), /Não foi possível executar a demonstração/)
  assert.doesNotMatch(collision.output(), /postgresql:\/\/|password=|scrypt:|EADDRINUSE|stack/i)
  assert.deepEqual(await schemas(), [...before, firstSchema].sort())
  assert.deepEqual(await report(), initial)

  const correction = await fetch(`${base}/api/expenses/${DEMO_EXPENSE_ID}`, {
    method: 'PUT',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({
      date: '2026-10-14',
      category: 'DEMO · Energia fictícia',
      amountCents: 30000,
      description: null,
    }),
    signal: AbortSignal.timeout(10000),
  })
  assert.equal(correction.status, 200)
  assert.equal(object((await report()).summary).expenseRevenuePercent, 40)
  await stop(first, 'SIGINT')
  assert.deepEqual(await schemas(), before)

  // Outra execução começa do cenário original, sem resetar dados do usuário.
  const second = launch()
  processes.push(second)
  await ready(second)
  const secondSchema = newSchema(before, await schemas())
  assert.notEqual(secondSchema, firstSchema)
  assert.deepEqual(await report(), initial)
  await stop(second, 'SIGTERM')
  assert.deepEqual(await schemas(), before)
  await mkdir('.local/reports/demo-command', { recursive: true, mode: 0o700 })
  await writeFile(
    '.local/reports/demo-command/lifecycle.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        initial,
        firstSchema,
        secondSchema,
        portCollisionSafe: true,
        preexistingSchemasPreserved: true,
        correctionObserved: true,
        freshRestartVerified: true,
        sigintCleanup: true,
        sigtermCleanup: true,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )
  console.log(
    'PASS: comando demo com PostgreSQL/HTTP reais, roteiro disponível, porta ocupada com falha segura, correção observada, reinício com novo cenário isolado, SIGINT/SIGTERM removem somente schemas próprios.',
  )
} finally {
  try {
    for (const demo of processes) {
      if (demo.child.exitCode === null && demo.child.signalCode === null) {
        await stop(demo, 'SIGTERM')
      }
    }
  } finally {
    await db.$disconnect()
  }
}
