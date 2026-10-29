<script setup lang="ts">
  import AppIcon from './AppIcon.vue'
  defineProps<{ title: string; description: string }>()
</script>

<template>
  <main
    id="main-content"
    class="login-page"
    aria-labelledby="access-title"
  >
    <section class="login-story">
      <a
        class="brand-lockup"
        href="/entrar"
      >
        <span class="brand-mark"><AppIcon name="brand" /></span>
        <span>
          VisãoAtiva
          <small>Clareza para decidir.</small>
        </span>
      </a>
      <div>
        <p class="eyebrow">DADOS QUE ORIENTAM</p>
        <h2 id="login-title">
          Mais clareza.
          <br />
          Melhores decisões.
        </h2>
        <p>
          Transforme seus registros em sugestões explicadas, com números que você pode conferir.
        </p>
        <div class="login-steps">
          <div>
            <span>01</span>
            Organize os registros
          </div>
          <div>
            <span>02</span>
            Entenda os números
          </div>
          <div>
            <span>03</span>
            Escolha seu próximo passo
          </div>
        </div>
      </div>
      <p class="help">Projeto acadêmico · Engenharia de Software</p>
    </section>
    <section
      class="login-card"
      aria-labelledby="access-title"
    >
      <span class="icon-tile login-emblem"><AppIcon name="shield" /></span>
      <span class="section-kicker">ACESSO ADMINISTRATIVO</span>
      <h1 id="access-title">{{ title }}</h1>
      <p>{{ description }}</p>
      <slot />
      <div class="login-security">
        <AppIcon name="shield" />
        Acesso restrito a esta máquina
      </div>
    </section>
  </main>
</template>

<style scoped>
  .login-emblem {
    display: flex;
    width: 48px;
    height: 48px;
    border-radius: 12px;
  }
  .login-steps {
    display: grid;
    gap: 1rem;
    margin-top: 2.5rem;
    color: #d0dcf0;
    font-size: 0.85rem;
  }
  .login-steps > div {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }
  .login-steps span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid #4c6386;
    border-radius: 8px;
    color: #b8cefc;
    font-size: 0.7rem;
  }
  @media (max-width: 48rem) {
    .login-steps,
    .login-emblem {
      display: none;
    }
  }
</style>
