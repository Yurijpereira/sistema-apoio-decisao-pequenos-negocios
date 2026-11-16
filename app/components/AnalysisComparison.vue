<script setup lang="ts">
  import { computed } from 'vue'
  import type { PeriodSummary } from '#shared/types/operations'
  import { formatCents } from '#shared/utils/money'
  import type { AnalysisComparison, ReferenceSuggestion } from '../utils/analysis-comparison'

  const props = defineProps<{ comparison: AnalysisComparison }>()
  defineEmits<{ discard: [] }>()
  const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
  const fields: {
    key: keyof PeriodSummary
    label: string
    format: 'money' | 'percent' | 'count'
  }[] = [
    { key: 'revenueCents', label: 'Receita registrada', format: 'money' },
    { key: 'costCents', label: 'Custo estimado das vendas', format: 'money' },
    { key: 'expenseCents', label: 'Despesas registradas', format: 'money' },
    { key: 'grossMarginPercent', label: 'Margem bruta estimada', format: 'percent' },
    { key: 'expenseRevenuePercent', label: 'Despesas / receita', format: 'percent' },
    { key: 'saleCount', label: 'Registros de venda', format: 'count' },
    { key: 'quantity', label: 'Unidades vendidas', format: 'count' },
  ]
  const periods = computed(() => [
    { key: 'summary' as const, label: 'Semana selecionada', period: props.comparison.after.period },
    {
      key: 'previousSummary' as const,
      label: 'Semana anterior',
      period: props.comparison.after.previousPeriod,
    },
  ])
  function value(input: number | null, format: 'money' | 'percent' | 'count'): string {
    if (input === null) {
      return 'Indisponível'
    }
    return format === 'money'
      ? formatCents(input)
      : `${number.format(input)}${format === 'percent' ? '%' : ''}`
  }
  function time(input: number): string {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(input)
  }
  function removalNote(item: ReferenceSuggestion): string {
    const status = props.comparison.after.analyses.find(
      (analysis) => analysis.ruleId === item.ruleId,
    )?.status
    return status === 'insufficient-data' || status === 'partial'
      ? 'A análise atual tem dados insuficientes ou cobertura parcial. O desaparecimento não comprova resolução.'
      : 'O critério deixou de gerar este aviso nos dados atuais; isso não comprova melhora financeira.'
  }
</script>

<template>
  <section
    class="panel analysis-comparison"
    aria-labelledby="comparison-title"
  >
    <div class="comparison-heading">
      <h3 id="comparison-title">O que mudou desde a última consulta</h3>
      <button
        type="button"
        class="secondary"
        @click="$emit('discard')"
      >
        Descartar referência
      </button>
    </div>
    <p class="help">
      Antes: {{ time(comparison.before.capturedAt) }}. Agora:
      {{ time(comparison.after.capturedAt) }} (São Paulo). São duas consultas dos mesmos períodos,
      não duas semanas diferentes.
    </p>
    <p
      v-if="!comparison.changed"
      class="comparison-result"
    >
      Nenhuma mudança nos indicadores, nas sugestões ou na situação das análises desde a consulta
      anterior.
    </p>
    <p
      v-else
      class="comparison-result"
    >
      Confira os valores e os avisos que mudaram. A situação atual de cada análise aparece logo
      abaixo deste comparativo.
    </p>
    <details
      v-for="(period, index) in periods"
      :key="period.key"
      :open="index === 0"
    >
      <summary>{{ period.label }} · {{ period.period.from }} a {{ period.period.to }}</summary>
      <dl class="comparison-metrics">
        <div
          v-for="field in fields"
          :key="field.key"
          :class="{
            changed:
              comparison.before[period.key][field.key] !== comparison.after[period.key][field.key],
          }"
        >
          <dt>{{ field.label }}</dt>
          <dd>
            <span>Antes</span>
            <strong>{{ value(comparison.before[period.key][field.key], field.format) }}</strong>
          </dd>
          <dd>
            <span>Agora</span>
            <strong>{{ value(comparison.after[period.key][field.key], field.format) }}</strong>
          </dd>
        </div>
      </dl>
    </details>
    <div
      v-if="comparison.added.length"
      class="suggestion-changes"
    >
      <h4>Passou a ser exibida ({{ comparison.added.length }})</h4>
      <ul>
        <li
          v-for="item in comparison.added"
          :key="item.key"
        >
          <strong>{{ item.title }}</strong>
          <p>{{ item.evidence }}</p>
        </li>
      </ul>
    </div>
    <div
      v-if="comparison.removed.length"
      class="suggestion-changes"
    >
      <h4>Deixou de ser exibida ({{ comparison.removed.length }})</h4>
      <ul>
        <li
          v-for="item in comparison.removed"
          :key="item.key"
        >
          <strong>{{ item.title }}</strong>
          <p>Antes: {{ item.evidence }}</p>
          <p>{{ removalNote(item) }}</p>
        </li>
      </ul>
    </div>
    <div
      v-if="comparison.updated.length"
      class="suggestion-changes"
    >
      <h4>Continua em atenção com dados diferentes ({{ comparison.updated.length }})</h4>
      <ul>
        <li
          v-for="item in comparison.updated"
          :key="item.after.key"
        >
          <strong>{{ item.after.title }}</strong>
          <p>
            Antes:
            <span v-if="item.before.title !== item.after.title">{{ item.before.title }} —</span>
            {{ item.before.evidence }}
          </p>
          <p>Agora: {{ item.after.evidence }}</p>
        </li>
      </ul>
    </div>
    <p class="help">
      Referência temporária desta aba, válida por até duas horas. Os horários são de consulta, não
      de alteração dos registros. Não constitui auditoria nem comprova que uma correção causou
      melhora financeira. Avisos do cadastro usam os preços atuais; vendas mantêm valores
      históricos.
    </p>
  </section>
</template>

<style scoped>
  .analysis-comparison {
    margin-block: 1rem;
  }
  .comparison-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--heading);
  }
  h4 {
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
  }
  button {
    min-height: 44px;
  }
  details {
    margin-block: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow-wrap: anywhere;
  }
  summary {
    cursor: pointer;
    padding: 0.85rem;
    min-height: 44px;
    font-weight: 600;
    font-size: 0.85rem;
  }
  .comparison-metrics {
    margin: 0;
    padding: 0 0.85rem 0.5rem;
  }
  .comparison-metrics > div {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
    padding: 0.65rem;
    border-top: 1px solid var(--border);
    font-size: 0.82rem;
  }
  .changed {
    background: #f0f4fd;
    border-radius: 5px;
  }
  dt {
    align-self: center;
    color: var(--heading);
  }
  dd {
    margin: 0;
    min-width: 0;
  }
  dd span {
    display: block;
    color: var(--muted);
    font-size: 0.75rem;
  }
  .suggestion-changes {
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }
  ul {
    padding-left: 1.2rem;
  }
  li + li {
    margin-top: 1rem;
  }
  li p {
    margin-block: 0.35rem;
  }
  .comparison-result {
    font-size: 0.85rem;
    color: var(--heading);
  }
  @media (max-width: 36rem) {
    .comparison-metrics > div {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    dt {
      grid-column: 1 / -1;
    }
    .comparison-heading button {
      width: 100%;
    }
  }
</style>
