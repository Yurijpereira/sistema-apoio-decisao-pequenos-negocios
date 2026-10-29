/** Valida a entrada do login; a política de criação é aplicada no provisionamento. */
export function validLoginPassword(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length >= 1 && value.length <= 128 && !/\p{Cc}/u.test(value)
  )
}

export function validNewPassword(value: unknown): value is string {
  return validLoginPassword(value) && value.length >= 15
}
