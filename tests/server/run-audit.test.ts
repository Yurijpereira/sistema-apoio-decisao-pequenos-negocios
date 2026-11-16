import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({ spawn: vi.fn(), mkdir: vi.fn(), read: vi.fn(), write: vi.fn() }))
vi.mock('node:child_process', () => ({ spawnSync: mocked.spawn }))
vi.mock('node:fs/promises', () => ({
  mkdir: mocked.mkdir,
  readFile: mocked.read,
  writeFile: mocked.write,
}))
const clean = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
}
const policy = { expiresOn: '2026-10-30', vulnerabilities: [] }
const lock = { packages: { 'node_modules/example': { version: '1.0.0' } } }
function saved(name: string): unknown {
  const calls = mocked.write.mock.calls.filter(([path]) => String(path).endsWith(name))
  const last = calls.at(-1)
  assert.ok(last)
  const value: unknown = JSON.parse(String(last[1]))
  return value
}
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = undefined
  mocked.spawn.mockReturnValue({ status: 0, stdout: JSON.stringify(clean) })
  mocked.mkdir.mockResolvedValue(undefined)
  mocked.write.mockResolvedValue(undefined)
  mocked.read.mockImplementation(async (path: string) =>
    JSON.stringify(path === 'package-lock.json' ? lock : policy),
  )
})
afterEach(() => {
  process.exitCode = undefined
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('comando do audit e relatórios de falha', () => {
  it('grava a consulta limpa e permite sucesso sem ocultar entradas', async () => {
    await import('../../scripts/run-audit.ts')
    assert.equal(process.exitCode, undefined)
    assert.deepEqual(saved('npm-audit.json'), clean)
    assert.deepEqual(saved('audit-gate.json'), {
      status: 'passed',
      total: 0,
      accepted: 0,
      blocked: 0,
    })
  })
  it('grava advisories mistos e retorna falha com a contagem real', async () => {
    const mixed = {
      ...clean,
      vulnerabilities: {
        example: {
          name: 'example',
          severity: 'high',
          nodes: ['node_modules/example'],
          via: [
            { url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', severity: 'high' },
            { url: 'https://github.com/advisories/GHSA-dddd-eeee-ffff', severity: 'low' },
          ],
        },
      },
      metadata: { vulnerabilities: { ...clean.metadata.vulnerabilities, high: 1, total: 1 } },
    }
    mocked.spawn.mockReturnValue({ status: 1, stdout: JSON.stringify(mixed) })
    await import('../../scripts/run-audit.ts')
    assert.equal(process.exitCode, 1)
    assert.deepEqual(saved('npm-audit.json'), mixed)
    assert.deepEqual(saved('audit-gate.json'), {
      status: 'blocked',
      total: 1,
      accepted: 0,
      blocked: 1,
    })
  })
  it('preserva o relatório recebido quando o gate rejeita seu formato', async () => {
    const invalid = { ...clean, metadata: { vulnerabilities: { total: 1 } } }
    mocked.spawn.mockReturnValue({ status: 1, stdout: JSON.stringify(invalid) })
    await import('../../scripts/run-audit.ts')
    assert.equal(process.exitCode, 1)
    assert.deepEqual(saved('npm-audit.json'), invalid)
    assert.deepEqual(saved('audit-gate.json'), { status: 'error', code: 'audit-input-invalid' })
  })
  it('limpa resultados antigos e não expõe detalhes de consulta inválida', async () => {
    for (const result of [
      { status: 1, stdout: 'CANARY_PRIVATE: JSON inválido' },
      { status: 2, stdout: 'CANARY_PRIVATE' },
      { status: null, error: new Error('CANARY_PRIVATE') },
    ]) {
      vi.resetModules()
      mocked.spawn.mockReturnValue(result)
      await import('../../scripts/run-audit.ts')
      assert.equal(process.exitCode, 1)
      assert.equal(saved('npm-audit.json'), null)
      assert.deepEqual(saved('audit-gate.json'), { status: 'error', code: 'audit-input-invalid' })
    }
    assert.doesNotMatch(JSON.stringify(vi.mocked(console.error).mock.calls), /CANARY_PRIVATE/)
  })
  it('falha se lock ou política não puderem ser validados', async () => {
    mocked.read.mockResolvedValue('{invalid')
    await import('../../scripts/run-audit.ts')
    assert.equal(process.exitCode, 1)
    assert.deepEqual(saved('npm-audit.json'), clean)
    assert.deepEqual(saved('audit-gate.json'), { status: 'error', code: 'audit-input-invalid' })
  })
  it('mantém saída não zero quando não consegue gravar os relatórios', async () => {
    mocked.write.mockRejectedValue(new Error('CANARY_PRIVATE'))
    await import('../../scripts/run-audit.ts')
    assert.equal(process.exitCode, 1)
    assert.match(JSON.stringify(vi.mocked(console.error).mock.calls), /relatório/)
    assert.doesNotMatch(JSON.stringify(vi.mocked(console.error).mock.calls), /CANARY_PRIVATE/)
  })
})
