import { parseCivilDate } from '../shared/utils/dates.ts'

const severityRanks = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 } as const
type Severity = keyof typeof severityRanks

function severity(value: unknown): Severity {
  if (
    value !== 'info' &&
    value !== 'low' &&
    value !== 'moderate' &&
    value !== 'high' &&
    value !== 'critical'
  ) {
    throw new Error('Severidade de audit inválida.')
  }
  return value
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Formato de audit inválido.')
  }
  return Object.fromEntries(Object.entries(value))
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error('Lista de audit inválida.')
  }
  return value
}
function fingerprint(value: unknown): string {
  const item = record(value)
  const versions = record(item.versions)
  if (
    typeof item.name !== 'string' ||
    !item.name ||
    !Object.values(versions).every((version) => typeof version === 'string' && version.length > 0)
  ) {
    throw new Error('Exceção de audit inválida.')
  }
  return JSON.stringify([
    item.name,
    severity(item.severity),
    strings(item.via).sort(),
    Object.entries(versions).sort(([a], [b]) => a.localeCompare(b)),
  ])
}

/** Aceita apenas o grafo, versões e severidades revisados; qualquer novidade bloqueia. */
export function auditGate(
  report: unknown,
  lock: unknown,
  exceptions: unknown,
  today: string,
): { total: number; accepted: number; blocked: number } {
  const audit = record(report)
  const policy = record(exceptions)
  const packages = record(record(lock).packages)
  const expiresOn = parseCivilDate(policy.expiresOn)
  if (
    audit.auditReportVersion !== 2 ||
    audit.error ||
    !Array.isArray(policy.vulnerabilities) ||
    !expiresOn ||
    !parseCivilDate(today)
  ) {
    throw new Error('Relatório ou política de audit inválidos.')
  }
  const known = new Set(policy.vulnerabilities.map(fingerprint))
  const vulnerabilities = record(audit.vulnerabilities)
  const findings = Object.entries(vulnerabilities)
  const counts = record(record(audit.metadata).vulnerabilities)
  if (
    counts.total !== findings.length ||
    Object.keys(severityRanks).some(
      (level) =>
        counts[level] !== findings.filter(([, value]) => record(value).severity === level).length,
    )
  ) {
    throw new Error('Contagem de audit inconsistente.')
  }
  let accepted = 0
  for (const [name, value] of findings) {
    const item = record(value)
    if (item.name !== name || !Array.isArray(item.via) || item.via.length === 0) {
      throw new Error('Achado de audit inválido.')
    }
    const aggregateSeverity = severity(item.severity)
    let legacySeverityMatches = true
    const via = item.via.map((cause: unknown) => {
      if (typeof cause === 'string') {
        if (!Object.hasOwn(vulnerabilities, cause)) {
          throw new Error('Causa de audit ausente.')
        }
        return cause
      }
      const advisory = record(cause)
      const advisorySeverity = severity(advisory.severity)
      if (
        typeof advisory.url !== 'string' ||
        !/^https:\/\/github\.com\/advisories\/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(
          advisory.url,
        ) ||
        severityRanks[advisorySeverity] > severityRanks[aggregateSeverity]
      ) {
        throw new Error('Advisory de audit inválido.')
      }
      // A política antiga só registra a severidade do pacote, sem detalhes por advisory.
      // Relatórios mistos são válidos, mas não podem aproveitar essas exceções.
      if (advisorySeverity !== aggregateSeverity) {
        legacySeverityMatches = false
      }
      return advisory.url
    })
    const nodes = strings(item.nodes)
    if (nodes.length === 0 || new Set(nodes).size !== nodes.length) {
      throw new Error('Versões de audit ausentes.')
    }
    const versions = Object.fromEntries(nodes.map((path) => [path, record(packages[path]).version]))
    const candidate = fingerprint({ name, severity: aggregateSeverity, via, versions })
    if (today <= expiresOn && legacySeverityMatches && known.has(candidate)) {
      accepted++
    }
  }
  return { total: findings.length, accepted, blocked: findings.length - accepted }
}
