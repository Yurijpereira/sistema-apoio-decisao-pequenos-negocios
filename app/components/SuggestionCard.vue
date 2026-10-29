<script setup lang="ts">
  import { computed } from 'vue'
  import AppIcon from './AppIcon.vue'
  import type { Suggestion } from '#shared/types/suggestions'
  import { formatCents } from '#shared/utils/money'

  const props = defineProps<{ suggestion: Suggestion; asOfDate: string }>()
  const evidence = computed(() => {
    const e = props.suggestion.evidence
    const rows: { label: string; value: string }[] = []
    const number = (label: string, value: number, money = false): void => {
      rows.push({
        label,
        value: money
          ? formatCents(value)
          : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value),
      })
    }
    if (e.basis === 'current-catalog' || e.basis === 'historical-sales') {
      rows.push({ label: 'Produto', value: e.productName })
      if (e.grossMarginPercent === null) {
        rows.push({
          label: 'Margem bruta estimada (%)',
          value: 'Indisponível: preço ou receita zero',
        })
      } else {
        number('Margem bruta estimada (%)', e.grossMarginPercent)
      }
    }
    if (e.basis === 'current-catalog') {
      number('Preço unitário cadastrado', e.unitPriceCents, true)
      number('Custo unitário cadastrado', e.unitCostCents, true)
    } else {
      number('Receita registrada', e.revenueCents, true)
      number('Limiar experimental (%)', e.thresholdPercent)
      if (e.basis === 'historical-sales') {
        number('Custo estimado das vendas', e.costCents, true)
        number('Quantidade vendida', e.quantity)
      }
      if (e.basis === 'historical-sales' || e.basis === 'comparable-periods') {
        number('Registros de venda', e.saleCount)
        number('Mínimo experimental de vendas', e.minimumSales)
      }
      if (e.basis === 'period-expenses') {
        number('Despesas registradas', e.expenseCents, true)
        number('Despesas / receita (%)', e.expenseRevenuePercent)
        rows.push({
          label: 'Maior categoria de despesa',
          value: `${e.topExpense.category}: ${formatCents(e.topExpense.amountCents)}`,
        })
      }
      if (e.basis === 'comparable-periods') {
        number('Receita anterior', e.previousRevenueCents, true)
        number('Registros de venda anteriores', e.previousSaleCount)
        number('Variação da receita (%)', e.revenueChangePercent)
        number('Base anterior mínima', e.minimumPreviousRevenueCents, true)
      }
    }
    return rows
  })
</script>

<template>
  <article
    class="panel insight"
    :class="{ 'insight-high': suggestion.severity === 'high' }"
    :data-rule="suggestion.ruleId"
  >
    <header class="insight-heading">
      <span class="insight-symbol"><AppIcon name="alert" /></span>
      <div>
        <p class="insight-meta">
          <span class="priority-badge">
            {{ suggestion.severity === 'high' ? 'Prioridade alta' : 'Atenção' }}
          </span>
          <span class="rule-code">{{ suggestion.ruleId }}</span>
        </p>
        <h3>{{ suggestion.title }}</h3>
      </div>
    </header>
    <p
      v-if="suggestion.period"
      class="help"
    >
      <strong>Período:</strong>
      {{ suggestion.period.from }} a {{ suggestion.period.to }} (datas inclusivas).
    </p>
    <p
      v-else
      class="help"
    >
      <strong>Cadastro atual consultado em {{ asOfDate }}.</strong>
      Aviso sem período de vendas.
    </p>
    <p
      v-if="suggestion.ruleId === 'SALES_DROP'"
      class="help"
    >
      Comparação: {{ suggestion.previousPeriod.from }} a {{ suggestion.previousPeriod.to }}.
    </p>
    <p class="insight-reason">{{ suggestion.reason }}</p>
    <dl class="evidence">
      <div
        v-for="row in evidence"
        :key="row.label"
      >
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </div>
    </dl>
    <p class="insight-action">
      <AppIcon name="arrow" />
      <span>
        <strong>Ação sugerida:</strong>
        {{ suggestion.action }}
      </span>
    </p>
    <details>
      <summary>Limitações da análise</summary>
      <ul>
        <li
          v-for="limitation in suggestion.limitations"
          :key="limitation"
        >
          {{ limitation }}
        </li>
      </ul>
    </details>
  </article>
</template>

<style scoped>
  .insight {
    margin-top: 1rem;
    overflow-wrap: anywhere;
    border-top: 3px solid #d3ae69;
  }
  .insight-high {
    border-top-color: #bd5960;
  }
  .insight-heading {
    display: flex;
    align-items: flex-start;
    gap: 0.9rem;
  }
  .insight-symbol {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    background: #fff6e5;
    color: var(--warning);
    border-radius: 10px;
  }
  .insight-high .insight-symbol {
    background: #fff0f1;
    color: var(--danger);
  }
  .insight-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.7rem;
    margin: 0 0 0.4rem;
  }
  .priority-badge {
    font-size: 0.7rem;
    font-weight: 650;
    color: #87570e;
    background: #fff6e5;
    padding: 0.15rem 0.5rem;
    border-radius: 5px;
  }
  .insight-high .priority-badge {
    color: #9a3038;
    background: #fff0f1;
  }
  .rule-code {
    color: var(--muted);
    font-size: 0.65rem;
    letter-spacing: 0.03em;
  }
  h3 {
    font-size: 1.15rem;
    margin: 0.2rem 0 0;
  }
  .insight-reason {
    font-size: 0.92rem;
  }
  .evidence {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.15rem 1.5rem;
    margin: 1.25rem 0;
    padding: 1.25rem;
    background: #f7f9fc;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  dt {
    color: var(--muted);
    font-size: 0.76rem;
  }
  dd {
    color: var(--heading);
    margin: 0.25rem 0 0;
    font-weight: 600;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }
  .insight-action {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    padding: 1rem;
    border-radius: 8px;
    background: var(--accent-soft);
    color: #2c4582;
    font-size: 0.88rem;
  }
  .insight-action > .app-icon {
    margin-top: 0.15rem;
  }
  details {
    padding-top: 1rem;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.8rem;
  }
  details ul {
    padding-left: 1.2rem;
  }
  summary {
    cursor: pointer;
    font-weight: 550;
    padding: 0.3rem 0;
    color: #405576;
  }
  @media (max-width: 64rem) {
    .evidence {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 36rem) {
    .evidence {
      grid-template-columns: 1fr;
    }
  }
</style>
