export function requestError(cause: unknown, fallback: string): string {
  const expired =
    typeof cause === 'object' && cause !== null && 'statusCode' in cause && cause.statusCode === 401
  return expired
    ? 'Sua sessão expirou ou foi encerrada. Entre novamente em outra aba e tente de novo; os campos digitados nesta tela foram mantidos.'
    : fallback
}
