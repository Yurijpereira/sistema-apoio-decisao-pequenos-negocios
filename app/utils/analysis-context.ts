import type { DatePeriod } from '#shared/types/suggestions'
import { parseCivilDate } from '#shared/utils/dates'

export function analysisDate(value: unknown): string | null {
  const date = parseCivilDate(value)
  return date && date >= '0001-01-14' ? date : null
}

export function recordPeriod(query: Record<string, unknown>): DatePeriod | null {
  const from = parseCivilDate(query.from)
  const to = parseCivilDate(query.to)
  return from && to && from <= to ? { from, to } : null
}

export function analysisHref(to: string): string {
  const date = analysisDate(to)
  return date ? `/sugestoes?${new URLSearchParams({ to: date })}` : '/sugestoes'
}

export function recordsHref(
  period: DatePeriod,
  analysisTo: string,
  section: 'sales-title' | 'expenses-title',
): string {
  const query = new URLSearchParams({ ...period, analysisTo })
  return `/registros?${query}#${section}`
}
