import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmod, lstat, mkdir, open, readFile, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'

interface BackupTarget {
  database: string
  user: string
  schema: string
}
export function backupTarget(env: NodeJS.ProcessEnv): BackupTarget {
  const url = new URL(env.DATABASE_URL ?? '')
  const database = decodeURIComponent(url.pathname.slice(1)),
    user = decodeURIComponent(url.username)
  const schema = url.searchParams.get('schema') ?? 'public'
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.port !== '5433' ||
    database !== env.POSTGRES_DB ||
    user !== env.POSTGRES_USER ||
    ![database, user, schema].every((value) => /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(value))
  ) {
    throw new Error(
      'Backup exige o PostgreSQL local do Compose na porta 5433 e identificadores válidos.',
    )
  }
  return { database, user, schema }
}
function docker(args: string[], input?: Buffer): Buffer {
  const result = spawnSync('docker', ['compose', 'exec', '-T', 'db', ...args], {
    input,
    maxBuffer: 256 * 1024 * 1024,
    timeout: 120000,
  })
  if (result.error || result.status !== 0) {
    throw new Error(
      `${args[0]} não concluiu a operação. Confira o serviço local e suas permissões.`,
    )
  }
  return result.stdout
}
async function backupDirectory(): Promise<string> {
  for (const path of ['.local', '.local/backups']) {
    await mkdir(path, { recursive: true, mode: 0o700 })
    const stat = await lstat(path)
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('Diretório privado de backup inválido.')
    }
    await chmod(path, 0o700)
  }
  return resolve('.local/backups')
}
export async function createBackup(env: NodeJS.ProcessEnv): Promise<string> {
  const target = backupTarget(env)
  const directory = await backupDirectory()
  const path = join(
    directory,
    `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID()}.dump`,
  )
  const archive = docker([
    'pg_dump',
    '-U',
    target.user,
    '-d',
    target.database,
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--strict-names',
    '--schema',
    target.schema,
    '--exclude-table-data',
    `${target.schema}."AdminSession"`,
    '--exclude-table-data',
    `${target.schema}."AdminLoginLimit"`,
    '--exclude-table-data',
    `${target.schema}."AdminAccount"`,
  ])
  const file = await open(path, 'wx', 0o600)
  try {
    await file.writeFile(archive)
  } catch (error) {
    await unlink(path)
    throw error
  } finally {
    await file.close()
  }
  return path
}
const businessTables = ['Product', 'Sale', 'Expense', '_prisma_migrations'] as const
function fingerprint(target: BackupTarget, database: string): string {
  const sql = businessTables
    .map(
      (table) =>
        `SELECT '${table}', count(*), md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text, '[]')) FROM "${target.schema}"."${table}" t`,
    )
    .join(';')
  return docker([
    'psql',
    '-X',
    '-U',
    target.user,
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-At',
    '-c',
    sql,
  ]).toString()
}
/** Restauração destrutiva limitada a banco descartável com nome gerado nesta chamada. */
export async function verifyBackup(env: NodeJS.ProcessEnv): Promise<string> {
  const target = backupTarget(env)
  const before = fingerprint(target, target.database)
  const path = await createBackup(env)
  const temporary = `visaoativa_restore_${randomUUID().replaceAll('-', '')}`
  if (!/^visaoativa_restore_[a-f0-9]{32}$/.test(temporary) || temporary === target.database) {
    throw new Error('Nome de restauração inseguro.')
  }
  let created = false
  try {
    docker(['createdb', '-U', target.user, '-T', 'template0', temporary])
    created = true
    docker(
      [
        'pg_restore',
        '-U',
        target.user,
        '--dbname',
        temporary,
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
      ],
      await readFile(path),
    )
    if (
      fingerprint(target, temporary) !== before ||
      fingerprint(target, target.database) !== before
    ) {
      throw new Error(
        'Backup divergiu dos dados. Execute sem gravações concorrentes e investigue antes de utilizá-lo.',
      )
    }
    const privateRows = docker([
      'psql',
      '-X',
      '-U',
      target.user,
      '-d',
      temporary,
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-c',
      `SELECT (SELECT count(*) FROM "${target.schema}"."AdminSession") + (SELECT count(*) FROM "${target.schema}"."AdminLoginLimit") + (SELECT count(*) FROM "${target.schema}"."AdminAccount")`,
    ])
      .toString()
      .trim()
    if (privateRows !== '0') {
      throw new Error('Backup não deve restaurar credenciais, sessões ou tentativas de login.')
    }
    return path
  } finally {
    if (created) {
      docker(['dropdb', '-U', target.user, temporary])
    }
  }
}
