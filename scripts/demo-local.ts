import { seedDemo } from './demo-data.ts'
import { getPrisma } from '../server/utils/prisma.ts'
import { localTestServer } from './local-test-server.ts'

async function main(): Promise<void> {
  const server = localTestServer(3001)
  let finish: () => void = () => {}
  const stopped = new Promise<void>((resolve) => {
    finish = resolve
  })
  process.once('SIGINT', finish)
  process.once('SIGTERM', finish)
  try {
    await server.start()
    await seedDemo(getPrisma())
    console.log(
      'Demonstração local com dados exclusivamente fictícios, em um schema temporário separado.',
    )
    console.log(`${server.base}/sugestoes?to=2026-10-14`)
    console.log(
      'Confira e confirme as duas semanas para analisar margem de 20%, despesas de 65% e queda de receita de 25%.',
    )
    console.log(
      'Use os atalhos das sugestões para corrigir os registros e volte à mesma análise. Os preços antigos das vendas são preservados.',
    )
    console.log(
      'Ctrl+C encerra o servidor e remove somente o schema temporário desta demonstração.',
    )
    await stopped
  } finally {
    process.off('SIGINT', finish)
    process.off('SIGTERM', finish)
    await server.cleanup()
  }
}

main().catch(() => {
  console.error(
    'Não foi possível executar a demonstração. Confira o PostgreSQL local, o build e a disponibilidade da porta 3001.',
  )
  process.exitCode = 1
})
