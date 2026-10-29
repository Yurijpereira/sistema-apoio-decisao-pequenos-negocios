import type { SuggestionQuery } from '../../shared/types/suggestions.ts'
import { parseCivilDate } from '../../shared/utils/dates.ts'
import { comparisonPeriods } from '../decision/suggestions.ts'
import { invalid, objectWithKeys } from './common.ts'

export function parseSuggestionQuery(value: unknown, asOfDate: string): SuggestionQuery {
  const query = objectWithKeys(value, ['to', 'recordsComplete'])
  const yesterday = new Date(Date.parse(`${asOfDate}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10)
  const to = parseCivilDate(query.to ?? yesterday)
  if (!to) {
    invalid('Informe uma data final válida no formato AAAA-MM-DD.')
  }
  try {
    comparisonPeriods(to)
  } catch {
    invalid('Os dois períodos devem caber entre os anos 0001 e 9999.')
  }
  const recordsComplete = query.recordsComplete ?? 'false'
  if (recordsComplete !== 'true' && recordsComplete !== 'false') {
    invalid('A confirmação dos registros deve ser true ou false.')
  }
  return { to, recordsComplete: recordsComplete === 'true' }
}
