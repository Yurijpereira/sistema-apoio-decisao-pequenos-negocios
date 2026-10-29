<script setup lang="ts">
  import { computed, ref } from 'vue'
  import AppIcon from '../components/AppIcon.vue'
  const route = useRoute()
  const leaving = ref(false)
  const error = ref('')
  const links = [
    { href: '/', label: 'Visão geral', icon: 'overview' },
    { href: '/produtos', label: 'Produtos', icon: 'products' },
    { href: '/registros', label: 'Vendas e despesas', icon: 'records' },
  ] as const
  const pageLabel = computed(() =>
    route.path === '/minha-conta'
      ? 'Minha conta'
      : (links.find((link) => link.href === route.path)?.label ?? 'Visão geral'),
  )
  async function signOut(): Promise<void> {
    if (leaving.value) {
      return
    }
    leaving.value = true
    error.value = ''
    try {
      await $fetch('/api/auth/logout', { method: 'POST', body: {} })
      await navigateTo('/entrar')
    } catch {
      error.value = 'Não foi possível encerrar a sessão. Tente novamente.'
    } finally {
      leaving.value = false
    }
  }
</script>

<template>
  <div
    v-if="['/entrar', '/configurar-conta'].includes(route.path)"
    class="login-shell"
  >
    <slot />
  </div>
  <div
    v-else
    class="app-shell"
  >
    <a
      class="skip-link"
      href="#main-content"
    >
      Pular para o conteúdo
    </a>
    <aside
      class="sidebar"
      aria-label="Menu do sistema"
    >
      <NuxtLink
        class="brand-lockup"
        to="/"
      >
        <span class="brand-mark"><AppIcon name="brand" /></span>
        <span>
          VisãoAtiva
          <small>Clareza para decidir.</small>
        </span>
      </NuxtLink>
      <p class="nav-caption">SEU NEGÓCIO</p>
      <nav aria-label="Navegação principal">
        <NuxtLink
          v-for="link in links"
          :key="link.href"
          :to="link.href"
          :class="{
            selected:
              route.path === link.href || (link.href === '/' && route.path === '/sugestoes'),
          }"
          :aria-current="
            route.path === link.href || (link.href === '/' && route.path === '/sugestoes')
              ? 'page'
              : undefined
          "
        >
          <AppIcon :name="link.icon" />
          <span>{{ link.label }}</span>
          <span
            v-if="route.path === link.href || (link.href === '/' && route.path === '/sugestoes')"
            class="nav-current-dot"
            aria-hidden="true"
          />
        </NuxtLink>
      </nav>
      <div class="sidebar-note">
        <AppIcon name="shield" />
        <span>
          Acesso local protegido
          <small>Suas decisões começam com dados que você pode conferir.</small>
        </span>
      </div>
      <div class="sidebar-account">
        <div class="account-identity">
          <span
            class="account-avatar"
            aria-hidden="true"
          >
            <AppIcon name="user" />
          </span>
          <span class="account-copy">
            Administrador
            <small>Sessão protegida</small>
          </span>
        </div>
        <button
          class="logout-button"
          type="button"
          :disabled="leaving"
          :aria-label="leaving ? 'Encerrando sessão' : 'Sair da conta'"
          @click="signOut"
        >
          <AppIcon name="logout" />
          <span>{{ leaving ? 'Saindo…' : 'Sair' }}</span>
        </button>
      </div>
      <p
        v-if="error"
        role="alert"
        class="sidebar-error"
      >
        {{ error }}
      </p>
    </aside>
    <div class="workspace">
      <div class="topbar">
        <span>
          Seu negócio
          <span
            class="topbar-divider"
            aria-hidden="true"
          >
            /
          </span>
          <strong>{{ pageLabel }}</strong>
        </span>
        <div class="topbar-actions">
          <span class="session-label">
            <AppIcon name="lock" />
            Acesso local
          </span>
          <NuxtLink
            class="topbar-account"
            to="/minha-conta"
            aria-label="Acessar Minha conta"
            :aria-current="route.path === '/minha-conta' ? 'page' : undefined"
          >
            <AppIcon name="user" />
            <span>Minha conta</span>
          </NuxtLink>
        </div>
      </div>
      <slot />
      <footer class="app-footer">
        <span>VisãoAtiva · Apoio à decisão</span>
        <span>Protótipo acadêmico · Portfólio/PAC</span>
      </footer>
    </div>
  </div>
</template>
