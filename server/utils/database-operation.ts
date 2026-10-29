import { createError, isError } from 'h3'

/** Não devolver mensagens do driver, SQL, host ou credenciais ao cliente. */
export async function databaseOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error: unknown) {
    if (isError(error)) {
      throw error
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025') {
      throw createError({ statusCode: 404, message: 'Registro não encontrado.' })
    }
    throw createError({
      statusCode: 503,
      message: 'Não foi possível acessar os registros. Tente novamente.',
    })
  }
}
