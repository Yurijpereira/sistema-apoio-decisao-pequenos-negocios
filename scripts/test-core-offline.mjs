import { registerHooks } from 'node:module'

// Alternativa de diagnóstico sem dependências para a suíte pura.
// Executa os mesmos casos/assertions no runner do Node; não mede cobertura
// e não substitui as suítes oficiais Vitest de servidor e componentes.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'vitest') {
      return { url: 'node:test', shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

await import('../tests/server/metrics.test.ts')
await import('../tests/server/rules.test.ts')
