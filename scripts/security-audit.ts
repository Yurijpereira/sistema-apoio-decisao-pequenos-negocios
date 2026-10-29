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
    typeof item.severity !== 'string' ||
    !Object.values(versions).every((version) => typeof version === 'string')
  ) {
    throw new Error('Exceção de audit inválida.')
  }
  return JSON.stringify([
    item.name,
    item.severity,
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
  if (
    audit.auditReportVersion !== 2 ||
    audit.error ||
    !Array.isArray(policy.vulnerabilities) ||
    typeof policy.expiresOn !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(policy.expiresOn)
  ) {
    throw new Error('Relatório ou política de audit inválidos.')
  }
  const known = new Set(policy.vulnerabilities.map(fingerprint))
  const findings = Object.entries(record(audit.vulnerabilities))
  if (record(record(audit.metadata).vulnerabilities).total !== findings.length) {
    throw new Error('Contagem de audit inconsistente.')
  }
  let accepted = 0
  for (const [name, value] of findings) {
    const item = record(value)
    if (item.name !== name || !Array.isArray(item.via) || item.via.length === 0) {
      throw new Error('Achado de audit inválido.')
    }
    const via = item.via.map((cause: unknown) => {
      if (typeof cause === 'string') {
        if (!Object.hasOwn(record(audit.vulnerabilities), cause)) {
          throw new Error('Causa de audit ausente.')
        }
        return cause
      }
      const advisory = record(cause)
      if (
        typeof advisory.url !== 'string' ||
        !/^https:\/\/github\.com\/advisories\/GHSA-[a-z0-9-]+$/.test(advisory.url) ||
        advisory.severity !== item.severity
      ) {
        throw new Error('Advisory de audit inválido.')
      }
      return advisory.url
    })
    const nodes = strings(item.nodes)
    if (nodes.length === 0) {
      throw new Error('Versões de audit ausentes.')
    }
    const versions = Object.fromEntries(nodes.map((path) => [path, record(packages[path]).version]))
    if (
      today <= policy.expiresOn &&
      known.has(fingerprint({ name, severity: item.severity, via, versions }))
    ) {
      accepted++
    }
  }
  return { total: findings.length, accepted, blocked: findings.length - accepted }
}
