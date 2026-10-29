export default defineNuxtConfig({
  compatibilityDate: '2026-10-15',
  nitro: { errorHandler: './server/error-handler.ts' },
  routeRules: {
    '/**': {
      headers: {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      },
    },
  },
  devtools: { enabled: false },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  typescript: {
    strict: true,
    tsConfig: {
      compilerOptions: { noUncheckedIndexedAccess: true },
    },
  },
  app: {
    head: {
      title: 'VisãoAtiva | Apoio à decisão',
      htmlAttrs: { lang: 'pt-BR' },
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      meta: [
        {
          name: 'description',
          content:
            'Protótipo acadêmico de apoio à decisão para pequenos negócios, com foco em padarias.',
        },
      ],
    },
  },
})
