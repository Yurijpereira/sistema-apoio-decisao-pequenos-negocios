import { MAX_PRODUCT_CENTS } from '../types/product.ts'

/** Reais sem separador de milhar; conversão inteira, sem arredondar entradas. */
export function parseMoneyInput(value: string): number | null {
  const match = /^(\d{1,8})(?:[,.](\d{1,2}))?$/.exec(value.trim())
  if (!match?.[1]) {
    return null
  }
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents <= MAX_PRODUCT_CENTS ? cents : null
}

export function formatMoneyInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`
}

/** Formata centavos sem perder a última casa perto de MAX_SAFE_INTEGER. */
export function formatCents(cents: number): string {
  const digits = String(cents).padStart(3, '0')
  const units = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `R$\u00a0${units},${digits.slice(-2)}`
}

/** Aceita decimal simples e BRL agrupado completo; nunca remove caracteres arbitrários. */
export function parseCurrencyInput(value: string): number | null {
  const text = value.trim().replace(/^R\$\s*/, '')
  if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(text)) {
    return parseMoneyInput(text.replaceAll('.', ''))
  }
  return parseMoneyInput(text)
}
