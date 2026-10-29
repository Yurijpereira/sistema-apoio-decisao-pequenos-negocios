<script setup lang="ts">
  import { requestError } from '../utils/request-error'
  import AppIcon from '../components/AppIcon.vue'
  import { computed, nextTick, onMounted, reactive, ref } from 'vue'
  import SaleForm from '../components/SaleForm.vue'
  import ExpenseForm from '../components/ExpenseForm.vue'
  import RecordPagination from '../components/RecordPagination.vue'
  import type { ProductList } from '#shared/types/product'
  import type {
    ExpenseInput,
    ExpenseView,
    PeriodSummary,
    RecordList,
    SaleInput,
    SaleView,
  } from '#shared/types/operations'
  import { businessDate, parseCivilDate } from '#shared/utils/dates'
  import { formatCents } from '#shared/utils/money'

  const draft = reactive({ from: '', to: '' })
  const period = ref({ from: '', to: '' })
  const defaultDate = ref('')
  const summary = ref<PeriodSummary | null>(null)
  const sales = ref<RecordList<SaleView> | null>(null)
  const expenses = ref<RecordList<ExpenseView> | null>(null)
  const products = ref<ProductList | null>(null)
  const salePage = ref(1)
  const expensePage = ref(1)
  const productPage = ref(1)
  const loading = ref(true)
  const saving = ref(false)
  const busy = computed(() => loading.value || saving.value)
  const error = ref('')
  const feedback = ref('')
  const editingSale = ref<SaleView | null>(null)
  const editingExpense = ref<ExpenseView | null>(null)
  const saleVersion = ref(0)
  const expenseVersion = ref(0)
  const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
  function displayPercent(value: number | null): string {
    return value === null ? 'Indisponível: receita zero' : `${percent.format(value)}%`
  }
  function statusCode(value: unknown): number | undefined {
    return typeof value === 'object' &&
      value !== null &&
      'statusCode' in value &&
      typeof value.statusCode === 'number'
      ? value.statusCode
      : undefined
  }
  async function refresh(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const [newSummary, newSales, newExpenses, newProducts] = await Promise.all([
        $fetch<PeriodSummary>('/api/period-summary', { query: period.value }),
        $fetch<RecordList<SaleView>>('/api/sales', {
          query: { ...period.value, page: salePage.value },
        }),
        $fetch<RecordList<ExpenseView>>('/api/expenses', {
          query: { ...period.value, page: expensePage.value },
        }),
        $fetch<ProductList>('/api/products', {
          query: { status: 'active', page: productPage.value },
        }),
      ])
      summary.value = newSummary
      sales.value = newSales
      expenses.value = newExpenses
      products.value = newProducts
    } catch (failure: unknown) {
      summary.value = null
      sales.value = null
      expenses.value = null
      error.value = requestError(
        failure,
        statusCode(failure) === 422
          ? 'O período excede o limite seguro dos totais. Selecione um intervalo menor.'
          : 'Não foi possível carregar os registros. Tente novamente.',
      )
    } finally {
      loading.value = false
    }
  }
  async function applyPeriod(): Promise<void> {
    if (busy.value) {
      return
    }
    if (!parseCivilDate(draft.from) || !parseCivilDate(draft.to) || draft.from > draft.to) {
      error.value = 'Informe datas válidas, com início anterior ou igual ao fim.'
      return
    }
    period.value = { ...draft }
    salePage.value = 1
    expensePage.value = 1
    feedback.value = ''
    await refresh()
  }
  async function saveRecord(
    kind: 'sales' | 'expenses',
    input: SaleInput | ExpenseInput,
  ): Promise<void> {
    if (busy.value) {
      return
    }
    saving.value = true
    error.value = ''
    feedback.value = ''
    const current = kind === 'sales' ? editingSale.value : editingExpense.value
    try {
      await $fetch(current ? `/api/${kind}/${current.id}` : `/api/${kind}`, {
        method: current ? 'PUT' : 'POST',
        body: input,
      })
      if (kind === 'sales') {
        editingSale.value = null
        saleVersion.value += 1
        salePage.value = 1
      } else {
        editingExpense.value = null
        expenseVersion.value += 1
        expensePage.value = 1
      }
      feedback.value = `${kind === 'sales' ? 'Venda' : 'Despesa'} ${current ? 'corrigida' : 'registrada'}.`
      if (input.date < period.value.from || input.date > period.value.to) {
        feedback.value += ' O registro está fora do período selecionado.'
      }
      await refresh()
    } catch (failure: unknown) {
      error.value = requestError(
        failure,
        statusCode(failure) === 409
          ? 'O produto está indisponível para uma nova venda ou troca. Selecione um produto ativo; os dados digitados foram mantidos.'
          : 'Não foi possível salvar. Os dados digitados foram mantidos; tente novamente.',
      )
    } finally {
      saving.value = false
    }
  }
  async function removeExpense(expense: ExpenseView): Promise<void> {
    if (
      busy.value ||
      !window.confirm(
        `Remover a despesa de ${formatCents(expense.amountCents)} da categoria “${expense.category}”?`,
      )
    ) {
      return
    }
    saving.value = true
    error.value = ''
    feedback.value = ''
    try {
      await $fetch(`/api/expenses/${expense.id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
      })
      if (editingExpense.value?.id === expense.id) {
        editingExpense.value = null
      }
      expensePage.value = 1
      feedback.value = 'Despesa removida.'
      await refresh()
    } catch (cause: unknown) {
      error.value = requestError(cause, 'Não foi possível remover a despesa. Tente novamente.')
    } finally {
      saving.value = false
    }
  }
  async function changePage(kind: 'sales' | 'expenses' | 'products', page: number): Promise<void> {
    if (busy.value) {
      return
    }
    if (kind === 'sales') {
      salePage.value = page
    } else if (kind === 'expenses') {
      expensePage.value = page
    } else {
      productPage.value = page
    }
    await refresh()
  }
  async function editSale(sale: SaleView): Promise<void> {
    editingSale.value = sale
    await nextTick()
    document.getElementById('sale-product')?.focus()
  }
  async function editExpense(expense: ExpenseView): Promise<void> {
    editingExpense.value = expense
    await nextTick()
    document.getElementById('expense-date')?.focus()
  }
  onMounted(async () => {
    defaultDate.value = businessDate(new Date())
    draft.from = `${defaultDate.value.slice(0, 7)}-01`
    draft.to = defaultDate.value
    period.value = { ...draft }
    await refresh()
  })
</script>

<template>
  <main
    id="main-content"
    class="welcome records-page"
    tabindex="-1"
    aria-labelledby="records-title"
  >
    <header class="page-header">
      <p class="eyebrow">DADOS DO NEGÓCIO</p>
      <div class="heading-row">
        <h1 id="records-title">Vendas e despesas</h1>
        <a
          class="secondary-link"
          href="/"
        >
          <AppIcon name="overview" />
          Ver sugestões
        </a>
      </div>
      <p class="intro">
        Registre as operações e confira os números do período, com preços e custos históricos das
        vendas.
      </p>
      <nav
        class="actions section-links"
        aria-label="Seções do sistema"
      >
        <a href="#new-sale">Nova venda</a>
        <a href="#new-expense">Nova despesa</a>
        <a href="#sales-title">Vendas do período</a>
        <a href="#expenses-title">Despesas do período</a>
        <a href="/produtos">Produtos</a>
      </nav>
    </header>
    <form
      class="panel"
      aria-label="Período dos registros"
      novalidate
      @submit.prevent="applyPeriod"
    >
      <fieldset
        class="record-fields"
        :disabled="busy"
      >
        <legend>Período dos registros</legend>
        <div class="period-fields">
          <div>
            <label for="period-from">De (inclusive)</label>
            <input
              id="period-from"
              v-model="draft.from"
              type="date"
              min="0001-01-01"
              max="9999-12-31"
            />
          </div>
          <div>
            <label for="period-to">Até (inclusive)</label>
            <input
              id="period-to"
              v-model="draft.to"
              type="date"
              min="0001-01-01"
              max="9999-12-31"
            />
          </div>
        </div>
        <div class="actions">
          <button type="submit">
            <AppIcon name="calendar" />
            Aplicar período
          </button>
          <button
            type="button"
            class="secondary"
            :disabled="busy"
            @click="refresh"
          >
            <AppIcon name="refresh" />
            Recarregar registros
          </button>
        </div>
      </fieldset>
    </form>
    <p
      v-if="error"
      role="alert"
      class="error-banner"
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
      v-if="feedback"
      role="status"
      class="success-banner"
    >
      {{ feedback }}
    </p>
    <p
      v-if="loading"
      class="loading-state"
      role="status"
    >
      Carregando registros…
    </p>
    <section
      v-if="summary && !loading"
      class="panel"
      aria-labelledby="summary-title"
      :aria-busy="loading"
    >
      <h2 id="summary-title">Resumo de {{ period.from }} a {{ period.to }}</h2>
      <dl class="summary-values">
        <div>
          <dt>Receita das vendas</dt>
          <dd data-testid="revenue">{{ formatCents(summary.revenueCents) }}</dd>
        </div>
        <div>
          <dt>Custo estimado das vendas</dt>
          <dd>{{ formatCents(summary.costCents) }}</dd>
        </div>
        <div>
          <dt>Quantidade vendida</dt>
          <dd>{{ summary.quantity }}</dd>
        </div>
        <div>
          <dt>Margem bruta estimada</dt>
          <dd data-testid="margin">{{ displayPercent(summary.grossMarginPercent) }}</dd>
        </div>
        <div>
          <dt>Despesas do período</dt>
          <dd data-testid="expense-total">{{ formatCents(summary.expenseCents) }}</dd>
        </div>
        <div>
          <dt>Despesas / receita</dt>
          <dd>{{ displayPercent(summary.expenseRevenuePercent) }}</dd>
        </div>
      </dl>
      <p class="help">
        Totais de todos os registros do período, incluindo as páginas seguintes. A margem considera
        os custos guardados nas vendas; não representa lucro líquido. Para conferir recomendações,
        <a href="/">abra a visão geral</a>
        .
      </p>
    </section>
    <div
      v-if="defaultDate"
      class="record-forms"
    >
      <section
        id="new-sale"
        class="panel"
        aria-label="Formulário de venda"
      >
        <SaleForm
          :key="`${editingSale?.id ?? 'new'}:${saleVersion}`"
          :products="products?.items ?? []"
          :initial="editingSale"
          :default-date="defaultDate"
          :busy="busy"
          @submit="saveRecord('sales', $event)"
          @cancel="editingSale = null"
        />
        <p
          v-if="products?.total === 0"
          class="help"
        >
          Não há produtos ativos disponíveis.
          <a href="/produtos">Cadastre ou reative um produto.</a>
        </p>
        <RecordPagination
          v-if="products"
          :page="productPage"
          :total="products.total"
          :page-size="products.pageSize"
          label="Produtos disponíveis para venda"
          :busy="busy"
          @change="changePage('products', $event)"
        />
      </section>
      <section
        id="new-expense"
        class="panel"
        aria-label="Formulário de despesa"
      >
        <ExpenseForm
          :key="`${editingExpense?.id ?? 'new'}:${expenseVersion}`"
          :initial="editingExpense"
          :default-date="defaultDate"
          :busy="busy"
          @submit="saveRecord('expenses', $event)"
          @cancel="editingExpense = null"
        />
      </section>
    </div>
    <section
      class="panel"
      aria-labelledby="sales-title"
      :aria-busy="loading"
    >
      <h2 id="sales-title">Vendas do período</h2>
      <template v-if="sales && !loading">
        <p
          v-if="sales.items.length === 0"
          class="empty-state"
        >
          Nenhuma venda neste período ou página.
        </p>
        <ul
          v-else
          class="record-list"
        >
          <li
            v-for="sale in sales.items"
            :key="sale.id"
            class="record-card"
          >
            <h3>{{ sale.productNameSnapshot }}</h3>
            <p>Data: {{ sale.date }} · Quantidade: {{ sale.quantity }}</p>
            <p>
              Preço unitário histórico: {{ formatCents(sale.unitPriceCents) }} · Custo unitário
              histórico: {{ formatCents(sale.unitCostCents) }}
            </p>
            <p>
              Receita: {{ formatCents(sale.revenueCents) }} · Margem bruta estimada:
              {{ displayPercent(sale.grossMarginPercent) }}
            </p>
            <button
              type="button"
              class="secondary"
              :aria-label="`Corrigir venda de ${sale.productNameSnapshot}`"
              :disabled="busy"
              @click="editSale(sale)"
            >
              Corrigir venda
            </button>
          </li>
        </ul>
        <RecordPagination
          :page="salePage"
          :total="sales.total"
          :page-size="sales.pageSize"
          label="Vendas"
          :busy="busy"
          @change="changePage('sales', $event)"
        />
      </template>
    </section>
    <section
      class="panel"
      aria-labelledby="expenses-title"
      :aria-busy="loading"
    >
      <h2 id="expenses-title">Despesas do período</h2>
      <template v-if="expenses && !loading">
        <p
          v-if="expenses.items.length === 0"
          class="empty-state"
        >
          Nenhuma despesa neste período ou página.
        </p>
        <ul
          v-else
          class="record-list"
        >
          <li
            v-for="expense in expenses.items"
            :key="expense.id"
            class="record-card"
          >
            <h3>{{ expense.category }}</h3>
            <p>Data: {{ expense.date }} · Valor: {{ formatCents(expense.amountCents) }}</p>
            <p v-if="expense.description">{{ expense.description }}</p>
            <div class="actions">
              <button
                type="button"
                class="secondary"
                :aria-label="`Corrigir despesa de ${expense.category}`"
                :disabled="busy"
                @click="editExpense(expense)"
              >
                Corrigir despesa
              </button>
              <button
                type="button"
                class="secondary danger"
                :aria-label="`Remover despesa de ${expense.category}`"
                :disabled="busy"
                @click="removeExpense(expense)"
              >
                Remover despesa
              </button>
            </div>
          </li>
        </ul>
        <RecordPagination
          :page="expensePage"
          :total="expenses.total"
          :page-size="expenses.pageSize"
          label="Despesas"
          :busy="busy"
          @change="changePage('expenses', $event)"
        />
      </template>
    </section>
  </main>
</template>

<style scoped>
  .period-fields,
  .record-forms {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
  }
  .period-fields {
    max-width: 44rem;
    margin-bottom: 1rem;
  }
  .record-forms .panel {
    min-width: 0;
  }
  section[id],
  h2[id] {
    scroll-margin-top: 1.5rem;
  }
  .summary-values {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
  }
  .summary-values > div {
    padding: 1rem;
    background: #f7f9fc;
    border: 1px solid var(--border);
    border-radius: 9px;
    min-width: 0;
  }
  dt {
    color: var(--muted);
    font-size: 0.8rem;
  }
  dd {
    color: var(--heading);
    margin: 0.4rem 0 0;
    font-size: 1.25rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .record-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .record-card {
    border-top: 1px solid var(--border);
    padding: 1.5rem 0;
    overflow-wrap: anywhere;
  }
  .record-card h3 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
  }
  .record-card p {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .record-card:last-child {
    padding-bottom: 0;
  }
  @media (max-width: 64rem) {
    .record-forms {
      grid-template-columns: 1fr;
      gap: 0;
    }
    .summary-values {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 36rem) {
    .summary-values,
    .period-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
