<script setup lang="ts">
  import { computed } from 'vue'
  import AppIcon from '../components/AppIcon.vue'

  const route = useRoute()
  const links = [
    { href: '/', label: 'Início', icon: 'home' },
    { href: '/sugestoes', label: 'Visão geral', icon: 'overview' },
    { href: '/produtos', label: 'Produtos', icon: 'products' },
    { href: '/registros', label: 'Vendas e despesas', icon: 'records' },
  ] as const
  const pageLabel = computed(
    () => links.find((link) => link.href === route.path)?.label ?? 'Início',
  )
</script>

<template>
  <div class="app-shell">
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
            selected: route.path === link.href,
          }"
          :aria-current="route.path === link.href ? 'page' : undefined"
        >
          <AppIcon :name="link.icon" />
          <span>{{ link.label }}</span>
          <span
            v-if="route.path === link.href"
            class="nav-current-dot"
            aria-hidden="true"
          />
        </NuxtLink>
      </nav>
      <div class="sidebar-note">
        <AppIcon name="shield" />
        <span>
          Uso local
          <small>Suas decisões começam com dados que você pode conferir.</small>
        </span>
      </div>
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
          <span class="local-label">
            <AppIcon name="shield" />
            Uso local
          </span>
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
