<script setup lang="ts">
  import { computed } from 'vue'
  import AppIcon from './AppIcon.vue'
  import type { AnalysisStatus, RuleAnalysis } from '#shared/types/suggestions'

  const props = defineProps<{ analyses: readonly RuleAnalysis[] }>()
  const labels: Record<AnalysisStatus, string> = {
    attention: 'Atenção identificada',
    'no-alert': 'Sem alerta pelo critério',
    'insufficient-data': 'Dados insuficientes',
    partial: 'Análise parcial',
    'confirmation-required': 'Confirmação necessária',
    'open-period': 'Período ainda aberto',
  }
  const sharedReason = computed(() => {
    const first = props.analyses[0]
    return first && props.analyses.every((analysis) => analysis.reason === first.reason)
      ? first.reason
      : ''
  })
</script>

<template>
  <section
    class="panel analysis-status"
    aria-labelledby="analysis-status-title"
  >
    <h3 id="analysis-status-title">O que foi possível analisar</h3>
    <p
      v-if="sharedReason"
      class="help shared-reason"
    >
      {{ sharedReason }}
    </p>
    <ul>
      <li
        v-for="analysis in analyses"
        :key="analysis.ruleId"
        :data-analysis-rule="analysis.ruleId"
        :data-analysis-status="analysis.status"
      >
        <div class="analysis-status-heading">
          <h4>{{ analysis.title }}</h4>
          <span
            class="analysis-status-label"
            :class="{
              'status-attention': analysis.status === 'attention',
              'status-partial': analysis.status === 'partial',
            }"
          >
            <AppIcon
              :name="
                analysis.status === 'no-alert'
                  ? 'check'
                  : analysis.status === 'attention' || analysis.status === 'partial'
                    ? 'alert'
                    : 'calendar'
              "
            />
            {{ labels[analysis.status] }}
          </span>
        </div>
        <p
          v-if="!sharedReason"
          class="help"
        >
          {{ analysis.reason }}
        </p>
      </li>
    </ul>
    <p class="help analysis-status-note">
      Avisos do cadastro atual são independentes destas três análises.
    </p>
  </section>
</template>

<style scoped>
  .analysis-status {
    margin-block: 1rem;
  }
  h3 {
    margin: 0 0 0.85rem;
    color: var(--heading);
    font-size: 1rem;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    padding-block: 0.85rem;
  }
  li + li {
    border-top: 1px solid var(--border);
  }
  .analysis-status-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
  }
  h4 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--heading);
  }
  .analysis-status-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: #405576;
    background: #f0f4fd;
    padding: 0.2rem 0.55rem;
    border-radius: 5px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .analysis-status-label .app-icon {
    width: 15px;
    height: 15px;
  }
  .status-attention,
  .status-partial {
    background: #fff6e5;
    color: #87570e;
  }
  li .help {
    margin-block: 0.45rem 0;
  }
  .analysis-status-note {
    margin-bottom: 0;
  }
</style>
