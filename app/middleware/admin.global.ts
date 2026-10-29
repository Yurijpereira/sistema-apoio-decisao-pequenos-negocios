export default defineNuxtRouteMiddleware(async (to) => {
  // SSR entrega somente a estrutura; leituras de negócio são autenticadas no servidor.
  if (import.meta.server || to.path === '/entrar') {
    return
  }
  try {
    if (to.path === '/configurar-conta') {
      const state = await $fetch<{ configured: boolean }>('/api/auth/setup')
      return state.configured ? navigateTo('/entrar') : undefined
    }
    const session = await $fetch<{ authenticated: boolean }>('/api/auth/session')
    if (!session.authenticated) {
      return navigateTo('/entrar')
    }
  } catch {
    return navigateTo('/entrar')
  }
})
