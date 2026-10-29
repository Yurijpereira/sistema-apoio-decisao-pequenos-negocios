import {
  MAX_SALE_QUANTITY,
  type ExpenseInput,
  type PeriodQuery,
  type SaleInput,
} from '../../shared/types/operations.ts'
import { parseCivilDate } from '../../shared/utils/dates.ts'
import { invalid, objectWithKeys, parseCents } from './common.ts'
import { parseProductId } from './products.ts'

function date(value: unknown): string {
  const parsed = parseCivilDate(value)
  if (!parsed) {
    invalid('Informe uma data civil válida no formato AAAA-MM-DD.')
  }
  return parsed
}

export function parseSaleInput(value: unknown): SaleInput {
  const input = objectWithKeys(value, [
    'productId',
    'date',
    'quantity',
    'unitPriceCents',
    'unitCostCents',
  ])
  if (
    typeof input.quantity !== 'number' ||
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > MAX_SALE_QUANTITY
  ) {
    invalid('A quantidade deve ser inteira, entre 1 e 1000000.')
  }
  return {
    productId: parseProductId(input.productId),
    date: date(input.date),
    quantity: input.quantity,
    unitPriceCents: parseCents(input.unitPriceCents),
    unitCostCents: parseCents(input.unitCostCents),
  }
}

export function parseExpenseInput(value: unknown): ExpenseInput {
  const input = objectWithKeys(value, ['date', 'category', 'description', 'amountCents'])
  if (
    typeof input.category !== 'string' ||
    input.category.trim().length < 1 ||
    input.category.trim().length > 80 ||
    /\p{Cc}/u.test(input.category)
  ) {
    invalid('Informe uma categoria de 1 a 80 caracteres, sem controles.')
  }
  const description = input.description ?? null
  if (
    description !== null &&
    (typeof description !== 'string' ||
      description.trim().length > 500 ||
      /\p{Cc}/u.test(description))
  ) {
    invalid('A descrição deve ter até 500 caracteres, sem controles.')
  }
  return {
    date: date(input.date),
    category: input.category.trim(),
    description: typeof description === 'string' ? description.trim() || null : null,
    amountCents: parseCents(input.amountCents),
  }
}

export function parsePeriodQuery(value: unknown): PeriodQuery {
  const query = objectWithKeys(value, ['from', 'to', 'page'])
  const from = date(query.from)
  const to = date(query.to)
  if (from > to) {
    invalid('O início do período não pode ser posterior ao fim.')
  }
  const page = query.page ?? '1'
  if (typeof page !== 'string' || !/^[1-9]\d{0,5}$/.test(page) || Number(page) > 100000) {
    invalid('Página inválida.')
  }
  return { from, to, page: Number(page) }
}
