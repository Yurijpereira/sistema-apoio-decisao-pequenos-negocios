import { invalid, objectWithKeys, parseCents, parseId } from './common.ts'
import type { ProductInput, ProductQuery } from '../../shared/types/product.ts'
import { MAX_PRODUCT_SEARCH_LENGTH } from '../../shared/types/product.ts'

export function parseProductInput(value: unknown): ProductInput {
  const input = objectWithKeys(value, ['name', 'salePriceCents', 'unitCostCents'])
  if (typeof input.name !== 'string') {
    invalid('Informe o nome do produto.')
  }
  const name = input.name.trim()
  if (name.length < 1 || name.length > 120 || /\p{Cc}/u.test(name)) {
    invalid('O nome deve ter entre 1 e 120 caracteres, sem caracteres de controle.')
  }
  return {
    name,
    salePriceCents: parseCents(input.salePriceCents),
    unitCostCents: parseCents(input.unitCostCents),
  }
}

export function parseProductId(value: unknown): string {
  return parseId(value)
}

export function parseProductStatus(value: unknown): { active: boolean } {
  const input = objectWithKeys(value, ['active'])
  if (typeof input.active !== 'boolean') {
    invalid('Informe o estado ativo do produto como booleano.')
  }
  return { active: input.active }
}

export function parseProductQuery(value: unknown): ProductQuery {
  const query = objectWithKeys(value, ['page', 'status', 'search'])
  const page = query.page ?? '1'
  const status = query.status ?? 'all'
  const search = query.search === undefined ? '' : query.search
  if (
    typeof search !== 'string' ||
    search.length > MAX_PRODUCT_SEARCH_LENGTH ||
    /\p{Cc}/u.test(search)
  ) {
    invalid('A busca deve ter até 120 caracteres, sem caracteres de controle.')
  }
  if (typeof page !== 'string' || !/^[1-9]\d{0,5}$/.test(page) || Number(page) > 100000) {
    invalid('Página inválida.')
  }
  if (status !== 'all' && status !== 'active' && status !== 'inactive') {
    invalid('Filtro de produtos inválido.')
  }
  return { page: Number(page), status, search: search.trim() }
}
