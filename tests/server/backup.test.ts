import assert from 'node:assert/strict'
import { it } from 'vitest'
import { backupTarget } from '../../scripts/backup.ts'

const env = {
  POSTGRES_DB: 'visaoativa',
  POSTGRES_USER: 'visaoativa',
  DATABASE_URL: 'postgresql://visaoativa:synthetic@127.0.0.1:5433/visaoativa?schema=public',
}
it('backup fica limitado ao Compose local, banco e schema controlados', () => {
  assert.deepEqual(backupTarget(env), {
    database: 'visaoativa',
    user: 'visaoativa',
    schema: 'public',
  })
  for (const url of [
    'postgresql://visaoativa:p@remote:5433/visaoativa',
    'postgresql://visaoativa:p@127.0.0.1:5432/visaoativa',
    `${env.DATABASE_URL.replace('schema=public', 'schema=public%22%3BDROP')}`,
    env.DATABASE_URL.replace('/visaoativa?', '/other?'),
  ]) {
    assert.throws(() => backupTarget({ ...env, DATABASE_URL: url }))
  }
})
