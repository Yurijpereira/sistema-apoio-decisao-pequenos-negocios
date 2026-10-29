import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { auditGate } from '../../scripts/security-audit.ts'

const advisory = 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc'
const lock = { packages: { 'node_modules/example': { version: '1.0.0' } } }
const finding = {
  name: 'example',
  severity: 'high',
  via: [{ url: advisory, severity: 'high' }],
  nodes: ['node_modules/example'],
}
const report = {
  auditReportVersion: 2,
  vulnerabilities: { example: finding },
  metadata: { vulnerabilities: { total: 1 } },
}
const policy = {
  expiresOn: '2026-10-30',
  vulnerabilities: [
    {
      name: 'example',
      severity: 'high',
      via: [advisory],
      versions: { 'node_modules/example': '1.0.0' },
    },
  ],
}
describe('gate de vulnerabilidades conhecidas', () => {
  it('mantém alerta explícito, aceita só versão/causa revisadas até a expiração', () => {
    assert.deepEqual(auditGate(report, lock, policy, '2026-10-16'), {
      total: 1,
      accepted: 1,
      blocked: 0,
    })
    assert.equal(auditGate(report, lock, policy, '2026-10-31').blocked, 1)
    assert.equal(
      auditGate(
        report,
        { packages: { 'node_modules/example': { version: '1.1.0' } } },
        policy,
        '2026-10-16',
      ).blocked,
      1,
    )
  })
  it('bloqueia novo advisory, mudança de severidade e pacote novo', () => {
    for (const change of [
      { ...finding, via: [{ url: advisory.replace('aaaa', 'dddd'), severity: 'high' }] },
      { ...finding, severity: 'critical', via: [{ url: advisory, severity: 'critical' }] },
    ]) {
      assert.equal(
        auditGate({ ...report, vulnerabilities: { example: change } }, lock, policy, '2026-10-16')
          .blocked,
        1,
      )
    }
    assert.equal(
      auditGate(report, lock, { ...policy, vulnerabilities: [] }, '2026-10-16').blocked,
      1,
    )
  })
  it('aceita relatório limpo mesmo após expirar; rejeita erro de rede/formato/contagem', () => {
    assert.equal(
      auditGate(
        { ...report, vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } },
        lock,
        policy,
        '2030-01-01',
      ).blocked,
      0,
    )
    for (const invalid of [
      { error: {} },
      { ...report, error: 'network' },
      { ...report, metadata: { vulnerabilities: { total: 0 } } },
    ]) {
      assert.throws(() => auditGate(invalid, lock, policy, '2026-10-16'))
    }
    assert.throws(() => auditGate(report, {}, policy, '2026-10-16'))
    assert.throws(() => auditGate(report, lock, {}, '2026-10-16'))
  })
})
