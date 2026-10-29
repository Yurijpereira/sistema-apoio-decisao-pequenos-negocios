import withNuxt from './.nuxt/eslint.config.mjs'
import prettier from 'eslint-config-prettier/flat'
import stylistic from '@stylistic/eslint-plugin'

export default withNuxt(
  {
    ignores: ['coverage/**', 'generated/**', 'security/semgrep.test.*'],
  },
  prettier,
  {
    name: 'visaoativa/readability',
    plugins: { '@stylistic': stylistic },
    rules: {
      curly: ['error', 'all'],
      '@stylistic/max-statements-per-line': ['error', { max: 1 }],
    },
  },
)
