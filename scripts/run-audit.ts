import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { auditGate } from './security-audit.ts'

try {
  const result = spawnSync('npm', ['audit', '--json'], {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  })
  if (result.error || ![0, 1].includes(result.status ?? -1)) {
    throw new Error('Não foi possível consultar o audit.')
  }
  const report: unknown = JSON.parse(result.stdout)
  const lock: unknown = JSON.parse(await readFile('package-lock.json', 'utf8'))
  const exceptions: unknown = JSON.parse(await readFile('security/audit-exceptions.json', 'utf8'))
  const outcome = auditGate(report, lock, exceptions, new Date().toISOString().slice(0, 10))
  await mkdir('.local/reports/security', { recursive: true, mode: 0o700 })
  await writeFile('.local/reports/security/npm-audit.json', JSON.stringify(report, null, 2), {
    mode: 0o600,
  })
  await writeFile('.local/reports/security/audit-gate.json', JSON.stringify(outcome, null, 2), {
    mode: 0o600,
  })
  console.log(
    `Audit: ${outcome.total} alertas; ${outcome.accepted} com exceção temporária; ${outcome.blocked} bloqueantes. Não equivale a audit limpo.`,
  )
  if (outcome.blocked) {
    process.exitCode = 1
  }
} catch {
  console.error(
    'Audit bloqueado: falha na consulta, no formato ou na política. Nenhum erro foi ignorado.',
  )
  process.exitCode = 1
}
