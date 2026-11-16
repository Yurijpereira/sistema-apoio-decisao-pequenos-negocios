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
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 } },
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
        auditGate(
          {
            ...report,
            vulnerabilities: { example: change },
            metadata: {
              vulnerabilities: {
                ...report.metadata.vulnerabilities,
                high: change.severity === 'high' ? 1 : 0,
                critical: change.severity === 'critical' ? 1 : 0,
              },
            },
          },
          lock,
          policy,
          '2026-10-16',
        ).blocked,
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
        {
          ...report,
          vulnerabilities: {},
          metadata: {
            vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
          },
        },
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

describe('relatório npm com múltiplas severidades e falha segura', () => {
  const lowAdvisory = 'https://github.com/advisories/GHSA-dddd-eeee-ffff'
  const mixed = {
    ...report,
    vulnerabilities: {
      example: { ...finding, via: [...finding.via, { url: lowAdvisory, severity: 'low' }] },
    },
  }
  it('interpreta advisories mistos como achado bloqueante, sem confundir com formato inválido', () => {
    assert.deepEqual(auditGate(mixed, lock, policy, '2026-11-15'), {
      total: 1,
      accepted: 0,
      blocked: 1,
    })
  })
  it('não aplica exceção antiga sem detalhamento às severidades mistas', () => {
    const historical = {
      ...policy,
      vulnerabilities: [{ ...policy.vulnerabilities[0], via: [advisory, lowAdvisory] }],
    }
    assert.equal(auditGate(mixed, lock, historical, '2026-10-16').accepted, 0)
  })
  it('rejeita severidades desconhecidas e aggregate que subestima o advisory', () => {
    for (const change of [
      { ...finding, severity: 'unknown' },
      { ...finding, via: [{ url: advisory, severity: 'unknown' }] },
      { ...finding, via: [{ url: advisory, severity: 'critical' }] },
      {
        ...finding,
        via: [{ url: 'https://example.com/advisories/GHSA-aaaa-bbbb-cccc', severity: 'high' }],
      },
    ]) {
      assert.throws(() =>
        auditGate({ ...report, vulnerabilities: { example: change } }, lock, policy, '2026-11-15'),
      )
    }
  })
  it('rejeita contagens por severidade inconsistentes, datas inválidas e versões ausentes', () => {
    assert.throws(() =>
      auditGate(
        {
          ...report,
          metadata: { vulnerabilities: { ...report.metadata.vulnerabilities, low: 1 } },
        },
        lock,
        policy,
        '2026-11-15',
      ),
    )
    assert.throws(() =>
      auditGate(report, lock, { ...policy, expiresOn: '2026-02-30' }, '2026-11-15'),
    )
    assert.throws(() => auditGate(report, lock, policy, '0000-01-01'))
    assert.throws(() =>
      auditGate(report, { packages: { 'node_modules/example': {} } }, policy, '2026-11-15'),
    )
  })
  it('computa dependências propagadas sem aceitar causas ou versões não revisadas', () => {
    const dependency = {
      name: 'dependent',
      severity: 'high',
      via: ['example'],
      nodes: ['node_modules/dependent'],
    }
    const graph = {
      ...report,
      vulnerabilities: { ...report.vulnerabilities, dependent: dependency },
      metadata: { vulnerabilities: { ...report.metadata.vulnerabilities, high: 2, total: 2 } },
    }
    const graphLock = {
      packages: { ...lock.packages, 'node_modules/dependent': { version: '1.0.0' } },
    }
    assert.deepEqual(auditGate(graph, graphLock, policy, '2026-11-15'), {
      total: 2,
      accepted: 0,
      blocked: 2,
    })
    assert.throws(() =>
      auditGate(
        {
          ...graph,
          vulnerabilities: {
            ...report.vulnerabilities,
            dependent: { ...dependency, via: ['absent'] },
          },
        },
        graphLock,
        policy,
        '2026-11-15',
      ),
    )
  })
})
