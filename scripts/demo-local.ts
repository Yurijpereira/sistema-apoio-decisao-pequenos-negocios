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
    console.log('Roteiro de demonstração: simulação de correções de lançamentos fictícios.')
    console.log(
      '1. Confira e confirme as semanas de 01–07 e 08–14/10/2026: margem bruta estimada 20%, despesas/receita 65%, variação de receita −25%. São quatro sugestões, incluindo o aviso independente do cadastro.',
    )
    console.log(
      '2. Pelo cartão de despesas, corrija a despesa fictícia de R$ 487,50 para R$ 300,00. Volte, confira e confirme novamente: despesas/receita 65% → 40%; somente o aviso de despesas deixa de aparecer.',
    )
    console.log(
      '3. Pelo cartão de margem, corrija uma venda fictícia de 25 unidades de R$ 10,00 para R$ 20,00 por unidade. Volte e consulte: receita R$ 1.000,00, margem bruta estimada 40%, despesas/receita 30%; saem os avisos de margem e queda.',
    )
    console.log(
      '4. Em Produtos, corrija o cadastro fictício para preço R$ 10,00 e custo R$ 8,00. Volte à análise: sai o aviso do cadastro, sem alterar os valores históricos das vendas.',
    )
    console.log(
      'O comparativo usa as consultas da mesma semana nesta aba. Ausência de sugestão não comprova saúde financeira; a simulação não demonstra resultado real do negócio.',
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
