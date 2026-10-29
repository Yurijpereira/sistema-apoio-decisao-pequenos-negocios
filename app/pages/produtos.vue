<script setup lang="ts">
  import { requestError } from '../utils/request-error'
  import { computed, nextTick, onMounted, ref } from 'vue'
  import ProductForm from '../components/ProductForm.vue'
  import AppIcon from '../components/AppIcon.vue'
  import { formatCents } from '#shared/utils/money'
  import type { ProductInput, ProductList, ProductStatus, ProductView } from '#shared/types/product'

  const result = ref<ProductList | null>(null)
  const loading = ref(true)
  const saving = ref(false)
  const error = ref('')
  const feedback = ref('')
  const editing = ref<ProductView | null>(null)
  const formVersion = ref(0)
  const page = ref(1)
  const status = ref<ProductStatus>('all')
  const busy = computed(() => loading.value || saving.value)
  const totalPages = computed(() =>
    Math.max(1, Math.ceil((result.value?.total ?? 0) / (result.value?.pageSize ?? 20))),
  )
  const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

  async function loadProducts(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      result.value = await $fetch<ProductList>('/api/products', {
        query: { page: page.value, status: status.value },
      })
    } catch (cause: unknown) {
      result.value = null
      error.value = requestError(cause, 'Não foi possível carregar os produtos. Tente novamente.')
    } finally {
      loading.value = false
    }
  }

  async function saveProduct(input: ProductInput): Promise<void> {
    if (busy.value) {
      return
    }
    saving.value = true
    error.value = ''
    feedback.value = ''
    const current = editing.value
    try {
      await $fetch(current ? `/api/products/${current.id}` : '/api/products', {
        method: current ? 'PUT' : 'POST',
        body: input,
      })
      editing.value = null
      formVersion.value += 1
      feedback.value = current ? 'Produto atualizado.' : 'Produto cadastrado.'
      page.value = 1
      await loadProducts()
    } catch (cause: unknown) {
      error.value = requestError(
        cause,
        'Não foi possível salvar o produto. Seus dados foram mantidos; confira os valores e tente novamente.',
      )
    } finally {
      saving.value = false
    }
  }

  async function editProduct(product: ProductView): Promise<void> {
    editing.value = product
    error.value = ''
    feedback.value = ''
    await nextTick()
    document.getElementById('product-name')?.focus()
  }

  async function toggleProduct(product: ProductView): Promise<void> {
    if (
      busy.value ||
      !window.confirm(
        `${product.active ? 'Desativar' : 'Reativar'} o produto “${product.name}”? O cadastro será preservado.`,
      )
    ) {
      return
    }
    saving.value = true
    error.value = ''
    feedback.value = ''
    try {
      await $fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        body: { active: !product.active },
      })
      if (editing.value?.id === product.id) {
        editing.value = null
      }
      feedback.value = product.active
        ? 'Produto desativado. Cadastro preservado.'
        : 'Produto reativado.'
      await loadProducts()
    } catch (cause: unknown) {
      error.value = requestError(cause, 'Não foi possível alterar o status. Tente novamente.')
    } finally {
      saving.value = false
    }
  }

  async function changePage(value: number): Promise<void> {
    page.value = value
    await loadProducts()
  }
  async function filterProducts(): Promise<void> {
    page.value = 1
    await loadProducts()
  }
  onMounted(loadProducts)
</script>

<template>
  <main
    id="main-content"
    class="welcome products-page"
    tabindex="-1"
    aria-labelledby="products-title"
  >
    <header class="page-header">
      <p class="eyebrow">DADOS DO NEGÓCIO</p>
      <div class="heading-row">
        <h1 id="products-title">Produtos</h1>
        <nav
          class="actions"
          aria-label="Atalhos"
        >
          <a
            class="secondary-link"
            href="/"
          >
            Ver sugestões
            <AppIcon name="arrow" />
          </a>
          <a
            class="primary-link"
            href="/registros"
          >
            <AppIcon name="plus" />
            Registrar operações
          </a>
        </nav>
      </div>
      <p class="intro">
        Organize preços e custos unitários para conferir a margem bruta estimada do cadastro.
      </p>
      <p class="help">
        O aviso considera os valores atuais. Não comprova vendas nem representa lucro líquido.
      </p>
    </header>
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
    <div class="products-grid">
      <section
        class="panel product-form-panel"
        aria-label="Cadastro de produto"
      >
        <ProductForm
          :key="`${editing?.id ?? 'new'}:${formVersion}`"
          :initial="editing"
          :busy="busy"
          @submit="saveProduct"
          @cancel="editing = null"
        />
      </section>
      <section
        class="panel"
        aria-labelledby="list-title"
        :aria-busy="loading"
      >
        <div class="list-heading">
          <h2 id="list-title">Produtos cadastrados</h2>
          <span
            v-if="result"
            class="count-badge"
          >
            {{ result.total }} no filtro
          </span>
        </div>
        <div class="toolbar">
          <div class="filter-field">
            <label for="product-status">Exibir</label>
            <select
              id="product-status"
              v-model="status"
              :disabled="busy"
              @change="filterProducts"
            >
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </div>
          <button
            type="button"
            class="secondary"
            :disabled="busy"
            data-testid="reload-products"
            @click="loadProducts"
          >
            <AppIcon name="refresh" />
            Recarregar
          </button>
        </div>
        <p
          v-if="loading"
          class="loading-state"
          role="status"
        >
          Carregando produtos…
        </p>
        <template v-else-if="result">
          <p
            v-if="result.items.length === 0"
            class="empty-state"
          >
            Nenhum produto nesta página ou filtro. Cadastre um produto ou altere a seleção.
          </p>
          <ul
            v-else
            class="product-list"
          >
            <li
              v-for="product in result.items"
              :key="product.id"
              class="product-card"
            >
              <div class="product-heading">
                <h3>{{ product.name }}</h3>
                <span
                  class="badge"
                  :class="{ 'badge-inactive': !product.active }"
                >
                  {{ product.active ? 'Ativo' : 'Inativo' }}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Preço de venda</dt>
                  <dd>{{ formatCents(product.salePriceCents) }}</dd>
                </div>
                <div>
                  <dt>Custo unitário estimado</dt>
                  <dd>{{ formatCents(product.unitCostCents) }}</dd>
                </div>
                <div>
                  <dt>Margem bruta estimada</dt>
                  <dd>
                    {{
                      product.grossMarginPercent === null
                        ? 'Indisponível: preço zero'
                        : `${percent.format(product.grossMarginPercent)}%`
                    }}
                  </dd>
                </div>
              </dl>
              <aside
                v-if="product.lowMargin"
                class="margin-notice"
                :aria-label="`Aviso de cadastro de ${product.name}`"
              >
                <p>{{ product.lowMargin.reason }}</p>
                <p>{{ product.lowMargin.action }}</p>
                <ul>
                  <li
                    v-for="limitation in product.lowMargin.limitations"
                    :key="limitation"
                  >
                    {{ limitation }}
                  </li>
                </ul>
              </aside>
              <div class="actions">
                <button
                  type="button"
                  class="secondary"
                  :disabled="busy"
                  :aria-label="`Editar ${product.name}`"
                  data-testid="edit-product"
                  @click="editProduct(product)"
                >
                  Editar
                </button>
                <button
                  type="button"
                  class="secondary"
                  :disabled="busy"
                  :aria-label="`${product.active ? 'Desativar' : 'Reativar'} ${product.name}`"
                  data-testid="toggle-product"
                  @click="toggleProduct(product)"
                >
                  {{ product.active ? 'Desativar' : 'Reativar' }}
                </button>
              </div>
            </li>
          </ul>
          <nav
            class="pagination"
            aria-label="Páginas de produtos"
          >
            <button
              type="button"
              class="secondary"
              :disabled="busy || page <= 1"
              @click="changePage(page - 1)"
            >
              Anterior
            </button>
            <span>Página {{ page }} de {{ totalPages }} · {{ result.total }} produto(s)</span>
            <button
              type="button"
              class="secondary"
              :disabled="busy || page >= totalPages"
              @click="changePage(page + 1)"
            >
              Próxima
            </button>
          </nav>
        </template>
      </section>
    </div>
  </main>
</template>

<style scoped>
  .products-grid {
    display: grid;
    grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.6fr);
    gap: 1.5rem;
    align-items: start;
  }
  .products-grid > .panel {
    margin-top: 0;
    min-width: 0;
  }
  .product-form-panel {
    position: sticky;
    top: 1.5rem;
  }
  .toolbar,
  .product-heading,
  .list-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .list-heading {
    padding-bottom: 1.2rem;
  }
  .list-heading h2 {
    margin: 0;
  }
  .toolbar {
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    padding: 1rem 0;
  }
  .filter-field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .filter-field label {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .filter-field select {
    min-width: 8rem;
  }
  .product-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .product-card {
    padding: 1.5rem 0;
    border-bottom: 1px solid var(--border);
    overflow-wrap: anywhere;
  }
  .product-card:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
  h3 {
    margin: 0;
    font-size: 1.05rem;
  }
  .badge {
    border-radius: 5px;
    padding: 0.2rem 0.6rem;
    background: var(--accent-soft);
    color: #3154a5;
    font-size: 0.73rem;
    font-weight: 600;
  }
  .badge-inactive {
    background: #eff2f6;
    color: #566174;
  }
  dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
    margin: 1.25rem 0;
  }
  dt {
    color: var(--muted);
    font-size: 0.76rem;
  }
  dd {
    color: var(--heading);
    margin: 0.3rem 0;
    font-weight: 600;
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .margin-notice {
    background: #fffbf2;
    border: 1px solid #ead7b0;
    border-left: 3px solid #c59a4c;
    border-radius: 7px;
    color: #77551d;
    padding: 0.85rem 1rem;
    margin: 1rem 0;
    font-size: 0.8rem;
  }
  .margin-notice p {
    margin-top: 0;
  }
  .margin-notice ul {
    padding-left: 1.25rem;
    margin-bottom: 0;
  }
  @media (max-width: 74rem) {
    .products-grid {
      grid-template-columns: 1fr;
    }
    .product-form-panel {
      position: static;
    }
  }
  @media (max-width: 36rem) {
    dl {
      grid-template-columns: 1fr;
    }
  }
</style>
