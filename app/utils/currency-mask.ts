import { parseCurrencyInput } from '#shared/utils/money'

function changedOnlyDigits(source: string, previous: string): boolean {
  let start = 0
  while (start < source.length && source[start] === previous[start]) {
    start++
  }
  let sourceEnd = source.length
  let previousEnd = previous.length
  while (
    sourceEnd > start &&
    previousEnd > start &&
    source[sourceEnd - 1] === previous[previousEnd - 1]
  ) {
    sourceEnd--
    previousEnd--
  }
  return (
    /^\d*$/.test(source.slice(start, sourceEnd)) && /^\d*$/.test(previous.slice(start, previousEnd))
  )
}

/** Mantém a parte decimal em edição sem aceitar agrupamentos ou centavos ambíguos. */
export function maskCurrencyInput(
  source: string,
  previous = '',
): { value: string; display: string } | null {
  const text = source.trim().replace(/^R\$\s*/, '')
  if (!text) {
    return { value: '', display: '' }
  }
  const grouped = /^\d{1,3}(?:\.\d{3})+(?:,\d{0,2})?$/.test(text)
  const editingGroups =
    /^R\$\s\d{1,3}(?:\.\d{3})*(?:,\d{0,2})?$/.test(previous) && changedOnlyDigits(source, previous)
  const decimal =
    editingGroups || (grouped && (source.trim().startsWith('R$') || text.includes(',')))
      ? text.replaceAll('.', '')
      : text.replace('.', ',')
  if (!/^\d{1,8}(?:,\d{0,2})?$/.test(decimal)) {
    return null
  }
  // Uma vírgula final é um estado de edição; não é um valor pronto para envio.
  if (parseCurrencyInput(decimal.replace(/,$/, '')) === null) {
    return null
  }
  const [units = '', fraction] = decimal.split(',')
  const groupedUnits = units.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return {
    value: decimal,
    display: `R$\u00a0${groupedUnits}${fraction === undefined ? '' : `,${fraction}`}`,
  }
}

/** Reposiciona a seleção pelos dígitos e separador decimal, ignorando a decoração. */
export function currencyCaretPosition(source: string, position: number, display: string): number {
  const decimalDot = /^(?:R\$\s*)?\d{1,8}\.\d{0,2}$/.test(source.trim())
  const before = source.slice(0, position)
  const count = (before.match(decimalDot ? /[\d,.]/g : /[\d,]/g) ?? []).length
  if (count === 0) {
    return Math.max(0, display.search(/\d/))
  }
  let remaining = count
  for (let index = 0; index < display.length; index++) {
    if (/[\d,]/.test(display[index] ?? '') && --remaining === 0) {
      return index + 1
    }
  }
  return display.length
}
