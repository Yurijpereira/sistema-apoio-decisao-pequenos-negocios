import { createError } from 'h3'
import { MAX_PRODUCT_CENTS } from '../../shared/types/product.ts'

export function invalid(message: string): never {
  throw createError({ statusCode: 400, message })
}

export function objectWithKeys(value: unknown, keys: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid('Envie um objeto válido.')
  }
  const entries = Object.entries(value)
  if (entries.some(([key]) => !keys.includes(key))) {
    invalid('Há campos desconhecidos na solicitação.')
  }
  return Object.fromEntries(entries)
}

export function parseCents(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_PRODUCT_CENTS
  ) {
    invalid('Valores monetários devem ser centavos inteiros entre 0 e 2147483647.')
  }
  return value
}

export function parseId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)
  ) {
    invalid('Identificador de registro inválido.')
  }
  return value
}
