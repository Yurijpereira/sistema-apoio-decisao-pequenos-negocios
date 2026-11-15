<script setup lang="ts">
  import AppIcon from '../components/AppIcon.vue'

  const steps = [
    {
      number: '01',
      title: 'Cadastre seus produtos',
      description:
        'Informe o preço de venda e o custo unitário para conhecer a margem bruta estimada de cada produto.',
      href: '/produtos',
      link: 'Ir para produtos',
      icon: 'products',
    },
    {
      number: '02',
      title: 'Registre o movimento',
      description:
        'Adicione vendas e despesas do dia a dia. Você pode consultar e corrigir os registros quando precisar.',
      href: '/registros',
      link: 'Ir para vendas e despesas',
      icon: 'records',
    },
    {
      number: '03',
      title: 'Confira as sugestões',
      description:
        'Escolha o período, confira os dados e veja indicadores e sugestões com a explicação de cada resultado.',
      href: '/sugestoes',
      link: 'Ir para visão geral',
      icon: 'overview',
    },
  ] as const
</script>

<template>
  <main
    id="main-content"
    class="welcome home-page"
  >
    <header class="home-intro">
      <p class="eyebrow">BEM-VINDO AO VISÃOATIVA</p>
      <h1>Mais clareza para decidir sobre o seu negócio.</h1>
      <p class="intro">
        Organize produtos, vendas e despesas em um só lugar e transforme seus registros em sugestões
        para o dia a dia. Um apoio simples para pequenos negócios, com foco no varejo e em padarias.
      </p>
      <div class="actions home-actions">
        <NuxtLink
          to="/sugestoes"
          class="primary-link"
        >
          Abrir visão geral
          <AppIcon name="arrow" />
        </NuxtLink>
        <a
          href="#primeiros-passos"
          class="secondary-link"
        >
          Como começar
        </a>
      </div>
    </header>

    <section
      id="primeiros-passos"
      class="home-start"
      aria-labelledby="home-start-title"
    >
      <div class="home-section-heading">
        <p class="section-kicker">DO REGISTRO À DECISÃO</p>
        <h2 id="home-start-title">Comece em três passos</h2>
        <p class="help">
          Primeira vez por aqui? Siga esta ordem. Depois, use o menu para ir direto ao que precisa.
        </p>
      </div>
      <ol class="home-steps">
        <li
          v-for="step in steps"
          :key="step.number"
          class="home-step"
        >
          <div class="home-step-heading">
            <span class="icon-tile"><AppIcon :name="step.icon" /></span>
            <span
              class="home-step-number"
              aria-hidden="true"
            >
              {{ step.number }}
            </span>
          </div>
          <h3>{{ step.title }}</h3>
          <p>{{ step.description }}</p>
          <NuxtLink :to="step.href">
            {{ step.link }}
            <AppIcon name="arrow" />
          </NuxtLink>
        </li>
      </ol>
    </section>

    <section
      class="panel home-about"
      aria-labelledby="home-about-title"
    >
      <div class="panel-heading">
        <span class="icon-tile"><AppIcon name="brand" /></span>
        <div>
          <h2 id="home-about-title">Sobre o sistema</h2>
          <p class="help">Informação para apoiar sua decisão, com contexto.</p>
        </div>
      </div>
      <div class="home-about-grid">
        <div>
          <h3>Sugestões que você pode conferir</h3>
          <p>
            O VisãoAtiva aplica regras aos dados registrados e explica os critérios de cada
            sugestão. Você avalia o contexto e decide o que faz sentido para o seu negócio.
          </p>
        </div>
        <div>
          <h3>Registros completos fazem diferença</h3>
          <p>
            Os resultados dependem do que foi informado. A margem bruta estimada considera preço e
            custo dos produtos; ela não representa o lucro líquido. O sistema não calcula
            sazonalidade, desperdício ou previsões.
          </p>
        </div>
      </div>
      <p class="home-local-note">
        <AppIcon name="shield" />
        Protótipo de uso local, sem login. Quem tem acesso a este ambiente pode consultar e alterar
        os registros.
      </p>
    </section>
  </main>
</template>
