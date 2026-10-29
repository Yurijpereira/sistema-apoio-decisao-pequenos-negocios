/** Intervalo civil [startDate, endDate): início incluso, fim exclusivo. */
export interface RevenuePeriod {
  readonly startDate: string
  readonly endDate: string
  readonly revenueCents: number
}

function assertValidCents(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      'Valores monetários devem ser inteiros não negativos e seguros, em centavos.',
    )
  }
}

/** null significa que o indicador não pode ser calculado; nunca equivale a zero. */
export function calculateGrossMarginPercent(
  unitPriceCents: number,
  unitCostCents: number,
): number | null {
  assertValidCents(unitPriceCents)
  assertValidCents(unitCostCents)

  if (unitPriceCents === 0) {
    return null
  }

  return ((unitPriceCents - unitCostCents) * 100) / unitPriceCents
}

export function calculateExpenseRevenuePercent(
  expenseCents: number,
  revenueCents: number,
): number | null {
  assertValidCents(expenseCents)
  assertValidCents(revenueCents)

  if (revenueCents === 0) {
    return null
  }

  return (expenseCents * 100) / revenueCents
}

function parseCivilDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError('Use uma data civil válida no formato AAAA-MM-DD.')
  }

  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new RangeError('Use uma data civil válida no formato AAAA-MM-DD.')
  }

  return timestamp
}

function validatePeriod(period: RevenuePeriod): { start: number; end: number } {
  assertValidCents(period.revenueCents)
  const start = parseCivilDate(period.startDate)
  const end = parseCivilDate(period.endDate)

  if (end <= start) {
    throw new RangeError('O fim exclusivo do período deve ser posterior ao início.')
  }

  return { start, end }
}

/**
 * Compara períodos consecutivos de igual duração, já encerrados em asOfDate.
 * A data de referência é explícita para manter o cálculo puro e reproduzível.
 * A completude dos registros de venda deve ser assegurada pelo chamador.
 */
export function calculateRevenueChangePercent(
  previous: RevenuePeriod,
  current: RevenuePeriod,
  asOfDate: string,
): number | null {
  const previousDates = validatePeriod(previous)
  const currentDates = validatePeriod(current)
  const referenceDate = parseCivilDate(asOfDate)

  if (
    previousDates.end > referenceDate ||
    currentDates.end > referenceDate ||
    previousDates.end !== currentDates.start ||
    previousDates.end - previousDates.start !== currentDates.end - currentDates.start ||
    previous.revenueCents === 0
  ) {
    return null
  }

  return ((current.revenueCents - previous.revenueCents) * 100) / previous.revenueCents
}
