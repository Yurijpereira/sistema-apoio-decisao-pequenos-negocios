import { send, setResponseHeaders, setResponseStatus, type H3Error, type H3Event } from 'h3'

const messages: Readonly<Record<number, string>> = {
  400: 'Solicitação inválida. Confira os dados.',
  401: 'Entre com a conta administrativa.',
  403: 'Acesso não autorizado.',
  404: 'Recurso não encontrado.',
  405: 'Método não permitido.',
  409: 'O registro não permite esta operação.',
  413: 'Corpo acima do limite permitido.',
  415: 'Envie dados em JSON.',
  422: 'Os dados excedem os limites da operação.',
  429: 'Muitas tentativas. Aguarde antes de tentar novamente.',
  503: 'Serviço temporariamente indisponível.',
}
/** Substitui o handler que poderia registrar URL/stack de erros não tratados. */
export default function errorHandler(error: H3Error, event: H3Event): Promise<void> {
  const statusCode =
    Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
      ? error.statusCode
      : 500
  const message = messages[statusCode] ?? 'Não foi possível concluir a solicitação.'
  setResponseStatus(event, statusCode)
  setResponseHeaders(event, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  })
  return send(
    event,
    JSON.stringify({ statusCode, message, requestId: event.context.observation?.requestId }),
  )
}
