import { createError, getHeader, setHeader, type H3Event } from 'h3'

export async function readJsonBody(event: H3Event): Promise<unknown> {
  const maximumBytes = 4096
  const tooLarge = () => {
    setHeader(event, 'Connection', 'close')
    event.node.req.resume()
    return createError({ statusCode: 413, message: 'O registro excede o tamanho permitido.' })
  }
  if (Number(getHeader(event, 'content-length')) > maximumBytes) {
    throw tooLarge()
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const value of event.node.req.iterator({ destroyOnReturn: false })) {
    const chunk: unknown = value
    if (!Buffer.isBuffer(chunk)) {
      throw createError({ statusCode: 400, message: 'Corpo da solicitação inválido.' })
    }
    size += chunk.length
    if (size > maximumBytes) {
      throw tooLarge()
    }
    chunks.push(chunk)
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return body
  } catch {
    throw createError({ statusCode: 400, message: 'JSON inválido.' })
  }
}
