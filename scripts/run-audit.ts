import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { auditGate } from './security-audit.ts'

const reportsDirectory = '.local/reports/security'
async function saveReport(
  name: 'npm-audit.json' | 'audit-gate.json',
  value: unknown,
): Promise<void> {
  await writeFile(`${reportsDirectory}/${name}`, JSON.stringify(value, null, 2), { mode: 0o600 })
}

try {
  await mkdir(reportsDirectory, { recursive: true, mode: 0o700 })
  // Uma consulta interrompida ou inválida não pode deixar um resultado anterior como atual.
  await saveReport('npm-audit.json', null)
  await saveReport('audit-gate.json', { status: 'error', code: 'audit-not-completed' })
  const result = spawnSync('npm', ['audit', '--json'], {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  })
  if (result.error || ![0, 1].includes(result.status ?? -1)) {
    throw new Error('Não foi possível consultar o audit.')
  }
  const report: unknown = JSON.parse(result.stdout)
  // Preservar a entrada recebida mesmo se a validação de formato/política falhar.
  await saveReport('npm-audit.json', report)
  const lock: unknown = JSON.parse(await readFile('package-lock.json', 'utf8'))
  const exceptions: unknown = JSON.parse(await readFile('security/audit-exceptions.json', 'utf8'))
  const outcome = auditGate(report, lock, exceptions, new Date().toISOString().slice(0, 10))
  await saveReport('audit-gate.json', {
    status: outcome.blocked ? 'blocked' : 'passed',
    ...outcome,
  })
  console.log(
    outcome.total === 0
      ? 'Audit: nenhum alerta informado pelo npm nesta consulta.'
      : `Audit: ${outcome.total} alertas; ${outcome.accepted} com exceção temporária; ${outcome.blocked} bloqueantes. Não equivale a audit limpo.`,
  )
  if (outcome.blocked) {
    process.exitCode = 1
  }
} catch {
  process.exitCode = 1
  console.error(
    'Audit bloqueado: falha na consulta, no formato ou na política. Nenhum erro foi ignorado.',
  )
  try {
    await mkdir(reportsDirectory, { recursive: true, mode: 0o700 })
    await saveReport('audit-gate.json', { status: 'error', code: 'audit-input-invalid' })
  } catch {
    console.error('Não foi possível gravar o relatório de falha do audit.')
  }
}
