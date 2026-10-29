import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPrisma } from '../server/utils/prisma.ts'
import { hashPassword, verifyPassword } from '../server/utils/password.ts'
import { localTestServer } from './local-test-server.ts'

const server = localTestServer(3114)
const db = getPrisma()
const passwords = [server.password, `${server.password} outra`] as const
const request = (
  path: string,
  method = 'GET',
  body?: unknown,
  cookie?: string,
  extra: Record<string, string> = {},
) =>
  fetch(`${server.base}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      origin: server.base,
      'content-type': 'application/json',
      // O servidor é reiniciado várias vezes; não reutilizar sockets da instância anterior.
      connection: 'close',
      ...(cookie ? { cookie } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })
try {
  await server.start(true, false, undefined, '')
  assert.deepEqual(await (await request('/api/auth/setup')).json(), { configured: false })
  assert.equal((await request('/api/health')).status, 503)
  assert.equal((await request('/entrar')).headers.get('location'), '/configurar-conta')
  assert.equal((await request('/configurar-conta')).status, 200)
  assert.equal(
    (await request('/api/auth/setup', 'POST', {}, undefined, { origin: 'https://evil.example' }))
      .status,
    403,
  )
  assert.equal(
    (
      await request('/api/auth/setup', 'GET', undefined, undefined, {
        'x-forwarded-for': '127.0.0.1',
      })
    ).status,
    403,
  )
  for (let index = 0; index < 5; index++) {
    assert.equal(
      (await request('/api/auth/setup', 'POST', { password: 'curta', confirmation: 'curta' }))
        .status,
      400,
    )
  }
  assert.equal(
    (
      await request('/api/auth/setup', 'POST', {
        password: passwords[0],
        confirmation: passwords[0],
      })
    ).status,
    429,
  )
  await server.stop()
  await server.start(true, false, undefined, '')
  assert.equal(
    (
      await request('/api/auth/setup', 'POST', {
        password: passwords[0],
        confirmation: passwords[0],
      })
    ).status,
    429,
  )
  await db.adminLoginLimit.update({ where: { id: 1 }, data: { windowEndsAt: new Date(0) } })
  const attempts = await Promise.all(
    passwords.map((password) =>
      request('/api/auth/setup', 'POST', { password, confirmation: password }),
    ),
  )
  assert.deepEqual(attempts.map((response) => response.status).sort(), [201, 409])
  const winner = passwords[attempts.findIndex((response) => response.status === 201)]
  assert.ok(winner)
  assert.equal(await db.adminAccount.count(), 1)
  const account = await db.adminAccount.findUniqueOrThrow({ where: { id: 1 } })
  assert.equal(await verifyPassword(winner, account.passwordHash), true)
  assert.notEqual(account.passwordHash, winner)
  const directory = await mkdtemp(join(tmpdir(), 'visaoativa-setup-cli-'))
  try {
    const config = `DATABASE_URL=${process.env.DATABASE_URL}\nADMIN_PASSWORD_HASH=\n`
    await writeFile(join(directory, '.env'), config, { mode: 0o600 })
    const provision = spawn(
      process.execPath,
      [fileURLToPath(new URL('./provision-admin.ts', import.meta.url))],
      {
        cwd: directory,
        env: process.env,
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    )
    let errorOutput = ''
    provision.stderr?.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString()
    })
    const [exitCode] = await once(provision, 'exit')
    assert.equal(exitCode, 1, 'CLI não deve substituir uma conta da interface sem --replace.')
    assert.ok(
      errorOutput.includes('Conta já configurada pela interface'),
      'A CLI deve recusar especificamente a conta já configurada.',
    )
    assert.equal(await readFile(join(directory, '.env'), 'utf8'), config)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }

  assert.equal(
    (await request('/api/auth/setup', 'POST', { password: winner, confirmation: winner })).status,
    409,
  )
  assert.equal((await request('/configurar-conta')).headers.get('location'), '/entrar')
  assert.equal((await request('/api/health')).status, 200)
  await server.stop()
  await server.start(true, false, undefined, '')
  const login = await request('/api/auth/login', 'POST', { password: winner })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie')?.split(';')[0]
  assert.ok(cookie)
  assert.equal((await request('/api/products', 'GET', undefined, cookie)).status, 200)
  await server.stop()
  await server.start(true, false, undefined, '')
  assert.equal((await request('/api/products', 'GET', undefined, cookie)).status, 200)
  assert.deepEqual(await db.adminAccount.findUniqueOrThrow({ where: { id: 1 } }), account)
  const recoveryPassword = `${server.password} recuperação`
  const recoveryHash = await hashPassword(recoveryPassword)
  await server.stop()
  await server.start(true, false, undefined, recoveryHash)
  assert.equal((await request('/api/products', 'GET', undefined, cookie)).status, 401)
  assert.equal((await request('/api/auth/login', 'POST', { password: winner })).status, 401)
  assert.equal(
    (await request('/api/auth/login', 'POST', { password: recoveryPassword })).status,
    200,
  )
  assert.equal(
    (await request('/api/auth/setup', 'POST', { password: winner, confirmation: winner })).status,
    409,
  )
  await server.stop()
  await server.start(true, false, undefined, 'inválido')
  assert.equal((await request('/api/auth/setup')).status, 503)
  assert.equal((await request('/api/health')).status, 503)
  assert.equal(await db.product.count(), 0)
  assert.equal(await db.sale.count(), 0)
  assert.equal(await db.expense.count(), 0)
  assert.equal(
    (
      await db.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = ${server.schema} AND table_name = 'AdminAccount'`
    )[0]?.count,
    1n,
  )
  assert.ok(!server.output().includes(winner))
  assert.ok(!server.output().includes(account.passwordHash))
  console.log(
    'PASS: configuração única, concorrência 201/409 no PostgreSQL, limite persistente, login/sessão após reinício, credencial de ambiente e proteção da CLI preservadas, falha fechada, logs sem segredos e dados de negócio isolados.',
  )
} finally {
  await server.cleanup()
}
