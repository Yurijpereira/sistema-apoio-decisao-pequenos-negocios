<script setup lang="ts">
  import { requestError } from '../utils/request-error'
  import { onMounted, reactive, ref } from 'vue'
  import SuggestionCard from '../components/SuggestionCard.vue'
  import AppIcon from '../components/AppIcon.vue'
  import type { SuggestionReport } from '#shared/types/suggestions'
  import { formatCents } from '#shared/utils/money'
  import { parseCivilDate } from '#shared/utils/dates'

  const draft = reactive({ to: '', recordsComplete: false })
  const report = ref<SuggestionReport | null>(null)
  const loading = ref(false)
  const error = ref('')

  function clearAnalysis(): void {
    report.value = null
    draft.recordsComplete = false
  }
  async function load(): Promise<void> {
    if (loading.value) {
      return
    }
    if (draft.to && !parseCivilDate(draft.to)) {
      error.value = 'Informe uma data final válida.'
      return
    }
    loading.value = true
    report.value = null
    error.value = ''
    try {
      const result = await $fetch<SuggestionReport>('/api/suggestions', {
        query: {
          ...(draft.to ? { to: draft.to } : {}),
          recordsComplete: String(draft.recordsComplete),
        },
      })
      report.value = result
      draft.to = result.period.to
    } catch (cause: unknown) {
      const code =
        typeof cause === 'object' && cause !== null && 'statusCode' in cause
          ? cause.statusCode
          : null
      error.value = requestError(
        cause,
        code === 422
          ? 'Análise indisponível: totais fora do limite seguro ou mais de 100 produtos na análise. Confira os registros e os limites da análise. Avisos de cadastro independem da semana. Nenhum resultado parcial é exibido.'
          : code === 400
            ? 'Confira a data: os dois períodos devem caber entre os anos 0001 e 9999.'
            : 'Não foi possível consultar as sugestões. Tente novamente.',
      )
    } finally {
      loading.value = false
    }
  }
  onMounted(load)
</script>

<template>
  <main
    id="main-content"
    class="welcome suggestions-page"
    tabindex="-1"
    aria-labelledby="suggestions-title"
  >
    <header class="page-header">
      <p class="eyebrow">VISÃO GERAL</p>
      <div class="heading-row">
        <h1 id="suggestions-title">Mais clareza para o seu próximo passo.</h1>
        <nav
          class="actions"
          aria-label="Atalhos da análise"
        >
          <a
            class="primary-link"
            href="/registros"
          >
            <AppIcon name="plus" />
            Registrar operações
          </a>
          <a
            class="secondary-link"
            href="/produtos"
          >
            Ver produtos
            <AppIcon name="arrow" />
          </a>
        </nav>
      </div>
      <p class="intro">
        Entenda o que merece atenção no seu negócio. Sugestões explicadas, com números dos seus
        registros e limites claros para cada análise.
      </p>
    </header>
    <section
      class="panel analysis-controls"
      aria-labelledby="analysis-period-title"
    >
      <div class="panel-heading">
        <span class="icon-tile"><AppIcon name="calendar" /></span>
        <div>
          <h2 id="analysis-period-title">Período da análise</h2>
          <p class="help">Duas semanas, uma visão mais clara dos seus registros.</p>
        </div>
      </div>
      <form
        aria-label="Configurar análise"
        @submit.prevent="load"
      >
        <fieldset
          class="record-fields analysis-fields"
          :disabled="loading"
        >
          <div class="analysis-date">
            <label for="suggestions-to">Último dia da semana a analisar</label>
            <input
              id="suggestions-to"
              v-model="draft.to"
              type="date"
              required
              min="0001-01-14"
              max="9999-12-31"
              aria-describedby="period-help"
              @input="clearAnalysis"
            />
            <p
              id="period-help"
              class="help"
            >
              Serão analisados os sete dias até essa data e comparados aos sete dias anteriores. O
              dia atual de São Paulo e datas futuras não são períodos completos.
            </p>
          </div>
          <div class="analysis-confirmation">
            <label
              class="confirmation"
              for="records-complete"
            >
              <input
                id="records-complete"
                v-model="draft.recordsComplete"
                type="checkbox"
                @change="report = null"
              />
              Conferi que todas as vendas e despesas dos dois períodos foram registradas e que as
              semanas são comparáveis.
            </label>
            <p class="help">
              A confirmação vale somente para esta consulta, não é salva nem auditada. Sem ela, são
              exibidos apenas avisos do cadastro atual. Ao alterar dados, confira-os novamente.
            </p>
          </div>
          <div class="analysis-actions">
            <button type="submit">
              <AppIcon name="refresh" />
              {{ loading ? 'Consultando…' : 'Atualizar análise' }}
            </button>
            <span class="help">Baseada nos registros, sem previsões ou garantias.</span>
          </div>
        </fieldset>
      </form>
    </section>
    <p
      v-if="error"
      class="error-banner"
      role="alert"
    >
      {{ error }}
      <a
        v-if="error.includes('sessão')"
        href="/entrar"
        target="_blank"
        rel="noopener"
      >
        Entrar em outra aba
      </a>
    </p>
    <p
      v-if="loading"
      class="loading-state"
      role="status"
    >
      Carregando suas sugestões…
    </p>
    <section
      v-if="report"
      aria-labelledby="insights-title"
      aria-live="polite"
    >
      <div class="section-heading">
        <div>
          <span class="section-kicker">O QUE MERECE ATENÇÃO</span>
          <h2 id="insights-title">Sugestões e avisos</h2>
        </div>
        <span class="count-badge">{{ report.suggestions.length }} nesta análise</span>
      </div>
      <div class="analysis-context">
        <AppIcon name="calendar" />
        <p>
          Semana selecionada:
          <strong>{{ report.period.from }} a {{ report.period.to }}</strong>
          .
          <span>
            Semana anterior:
            <strong>{{ report.previousPeriod.from }} a {{ report.previousPeriod.to }}</strong>
            .
          </span>
        </p>
      </div>
      <p class="help">
        Referência do servidor: {{ report.asOfDate }} (São Paulo). Registros
        {{
          report.recordsComplete
            ? 'declarados completos pelo usuário'
            : 'sem confirmação de completude'
        }}. Datas inclusivas.
      </p>
      <p
        v-if="report.suggestions.length === 0"
        class="empty-state"
        data-testid="empty-suggestions"
      >
        Nenhuma sugestão gerada nesta consulta. Confira os motivos abaixo; isso não comprova saúde
        financeira.
      </p>
      <SuggestionCard
        v-for="suggestion in report.suggestions"
        :key="suggestion.key"
        :suggestion="suggestion"
        :as-of-date="report.asOfDate"
      />
      <aside
        v-if="report.notices.length"
        class="panel analysis-notices"
        aria-labelledby="analysis-notices"
      >
        <h3 id="analysis-notices">
          <AppIcon name="shield" />
          Limites e informações necessárias
        </h3>
        <ul>
          <li
            v-for="notice in report.notices"
            :key="notice"
          >
            {{ notice }}
          </li>
        </ul>
      </aside>
      <p class="help">
        Depois de registrar ou corrigir dados em Vendas e despesas, volte e atualize a análise.
        Editar produto altera somente os avisos do cadastro; vendas antigas mantêm seus próprios
        valores.
      </p>
    </section>
    <section
      v-if="report"
      class="period-indicators"
      aria-labelledby="indicators-title"
    >
      <div class="section-heading">
        <div>
          <span class="section-kicker">CONTEXTO DOS REGISTROS</span>
          <h2 id="indicators-title">Indicadores da semana</h2>
        </div>
      </div>
      <p class="help">
        Valores informados de {{ report.period.from }} a {{ report.period.to }}. Não representam
        lucro líquido nem comprovam completude.
      </p>
      <dl class="kpi-grid">
        <div>
          <dt>Receita registrada</dt>
          <dd>
            {{ formatCents(report.summary.revenueCents) }}
            <small>{{ report.summary.saleCount }} registro(s) de venda</small>
          </dd>
        </div>
        <div>
          <dt>Custo estimado das vendas</dt>
          <dd>
            {{ formatCents(report.summary.costCents) }}
            <small>Valores históricos das operações</small>
          </dd>
        </div>
        <div>
          <dt>Despesas registradas</dt>
          <dd>
            {{ formatCents(report.summary.expenseCents) }}
            <small>Categorias informadas</small>
          </dd>
        </div>
        <div>
          <dt>Margem bruta estimada</dt>
          <dd>
            {{
              report.summary.grossMarginPercent === null
                ? 'Indisponível'
                : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(report.summary.grossMarginPercent)}%`
            }}
            <small>Sem inferir lucro líquido</small>
          </dd>
        </div>
      </dl>
    </section>
  </main>
</template>

<style scoped>
  h1 {
    max-width: 24ch;
  }
  .analysis-controls {
    margin-top: 0;
  }
  .analysis-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
    gap: 1rem 2rem;
  }
  .analysis-date label {
    margin-top: 0;
  }
  #suggestions-to {
    display: block;
    max-width: 21rem;
  }
  .analysis-confirmation {
    padding: 1rem 1.1rem;
    background: #f6f8fc;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .analysis-confirmation .help {
    margin-bottom: 0;
  }
  .record-fields .confirmation {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    font-weight: 550;
    margin: 0;
  }
  .confirmation input {
    width: 1.15rem;
    margin: 0.2rem 0 0;
    flex-shrink: 0;
  }
  .analysis-actions {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }
  .analysis-context {
    display: flex;
    gap: 0.65rem;
    align-items: flex-start;
    padding: 0.9rem 1rem;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: #fff;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .analysis-context > .app-icon {
    margin-top: 0.2rem;
    color: var(--accent);
  }
  .analysis-context p {
    margin: 0;
  }
  .analysis-context span {
    display: inline-block;
    margin-left: 0.65rem;
  }
  .analysis-notices {
    background: #f0f4fd;
    border-color: #d5e0f5;
    color: #3c5070;
    box-shadow: none;
    font-size: 0.85rem;
  }
  .analysis-notices h3 {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0;
    font-size: 0.95rem;
  }
  .analysis-notices ul {
    padding-left: 1.3rem;
    margin-bottom: 0;
  }
  .analysis-notices li + li {
    margin-top: 0.5rem;
  }
  @media (max-width: 66rem) {
    .analysis-fields {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 36rem) {
    .analysis-context span {
      display: block;
      margin-left: 0;
    }
  }
</style>
