import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { Prisma } from '../generated/prisma/client.ts'
import { hashPassword } from '../server/utils/password.ts'
import { getPrisma } from '../server/utils/prisma.ts'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout } from 'node:timers/promises'

export function object(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === 'object' && value !== null && !Array.isArray(value))
  return Object.fromEntries(Object.entries(value))
}

export function recordId(record: Record<string, unknown>): string {
  assert.equal(typeof record.id, 'string')
  if (typeof record.id !== 'string') {
    throw new Error('Identificador ausente.')
  }
  return record.id
}

export function localTestServer(port: number) {
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.ok(
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    'O teste exige PostgreSQL local.',
  )
  const schema = `visaoativa_test_${randomUUID().replaceAll('-', '')}`
  url.searchParams.set('schema', schema)
  process.env.DATABASE_URL = url.toString()
  const password = randomBytes(24).toString('base64url')
  let hash = ''
  let cookie = ''
  let initialized = false
  let capturedOutput = ''
  const db = getPrisma()
  async function initialize(): Promise<void> {
    if (initialized) {
      return
    }
    assert.match(schema, /^visaoativa_test_[a-f0-9]{32}$/)
    await db.$executeRaw(Prisma.sql`CREATE SCHEMA ${Prisma.raw(`"${schema}"`)}`)
    const migration = spawn(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      { env: process.env, stdio: 'ignore' },
    )
    const [code] = await once(migration, 'exit')
    assert.equal(code, 0, 'Falha ao migrar o schema temporário do teste.')
    hash = await hashPassword(password)
    initialized = true
  }
  async function cleanup(): Promise<void> {
    await stop()
    assert.match(schema, /^visaoativa_test_[a-f0-9]{32}$/)
    try {
      await db.$executeRaw(Prisma.sql`DROP SCHEMA IF EXISTS ${Prisma.raw(`"${schema}"`)} CASCADE`)
    } finally {
      await db.$disconnect()
    }
  }
  const base = `http://127.0.0.1:${port}`
  let child: ChildProcess | undefined
  async function start(
    enabled = true,
    authenticate = true,
    databaseUrl = process.env.DATABASE_URL,
    adminPasswordHash?: string,
  ): Promise<void> {
    await initialize()
    let output = ''
    child = spawn(process.execPath, ['.output/server/index.mjs'], {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        HOST: '127.0.0.1',
        PORT: String(port),
        LOCAL_PRODUCTS_ENABLED: String(enabled),
        ADMIN_PASSWORD_HASH: adminPasswordHash ?? hash,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', (data: Buffer) => {
      output += data.toString()
      capturedOutput += data.toString()
    })
    child.stderr?.on('data', (data: Buffer) => {
      output += data.toString()
      capturedOutput += data.toString()
    })
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) {
        throw new Error(`O servidor de teste não iniciou. Confira a porta ${port} e o build.`)
      }
      if (output.includes('Listening on')) {
        if (enabled && authenticate) {
          await login()
        }
        return
      }
      await setTimeout(100)
    }
    throw new Error('Tempo de inicialização excedido.')
  }
  async function stop(): Promise<void> {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      return
    }
    const closed = once(child, 'exit')
    child.kill('SIGTERM')
    await closed
    child = undefined
  }
  async function api(
    path: string,
    method = 'GET',
    body?: unknown,
    expected = 200,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${base}/api/${path}`, {
      method,
      headers: { origin: base, 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    assert.equal(response.status, expected, `${method} ${path}`)
    if (expected === 204) {
      return {}
    }
    const json: unknown = await response.json()
    return object(json)
  }
  async function login(): Promise<void> {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { origin: base, 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(10000),
    })
    assert.equal(response.status, 200, 'Login sintético da integração')
    cookie = response.headers.get('set-cookie')?.split(';')[0] ?? ''
    assert.ok(cookie)
  }
  return {
    base,
    start,
    stop,
    api,
    cleanup,
    password,
    sessionCookie: () => cookie,
    schema,
    output: () => capturedOutput,
  }
}
