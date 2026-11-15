<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
  import AppIcon from './AppIcon.vue'
  import {
    MAX_PRODUCT_SEARCH_LENGTH,
    type ProductList,
    type ProductView,
  } from '#shared/types/product'
  import { formatCents } from '#shared/utils/money'

  const props = withDefaults(
    defineProps<{
      id: string
      selectedId: string
      selectedLabel: string
      disabled?: boolean
      invalid?: boolean
      errorId?: string
    }>(),
    { errorId: '' },
  )
  const emit = defineEmits<{
    select: [product: ProductView]
    clear: []
    'pending-change': [pending: boolean]
  }>()
  const container = ref<HTMLElement | null>(null)
  const input = ref<HTMLInputElement | null>(null)
  const text = ref(props.selectedLabel)
  const expanded = ref(false)
  const loading = ref(false)
  const error = ref('')
  const result = ref<ProductList | null>(null)
  const page = ref(1)
  const active = ref(-1)
  const pending = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let version = 0
  let disposed = false
  let returningFocus = false
  const items = computed(() => result.value?.items ?? [])
  const pages = computed(() =>
    Math.max(1, Math.ceil((result.value?.total ?? 0) / (result.value?.pageSize ?? 20))),
  )
  const activeId = computed(() =>
    expanded.value && items.value[active.value] ? `${props.id}-option-${active.value}` : undefined,
  )
  const describedBy = computed(() =>
    [props.invalid ? props.errorId : '', `${props.id}-help`].filter(Boolean).join(' '),
  )

  function setPending(value: boolean): void {
    pending.value = value
    emit('pending-change', value)
  }
  function cancelRequest(): void {
    clearTimeout(timer)
    controller?.abort()
    version++
    loading.value = false
  }
  function close(restore = false): void {
    expanded.value = false
    active.value = -1
    cancelRequest()
    if (restore) {
      text.value = props.selectedLabel
      setPending(false)
    }
  }
  async function search(): Promise<void> {
    clearTimeout(timer)
    controller?.abort()
    const current = ++version
    const request = new AbortController()
    controller = request
    loading.value = true
    error.value = ''
    result.value = null
    active.value = -1
    try {
      const data = await $fetch<ProductList>('/api/products', {
        query: {
          status: 'active',
          page: page.value,
          search: pending.value ? text.value.trim() : '',
        },
        signal: request.signal,
      })
      if (!disposed && current === version) {
        result.value = data
      }
    } catch {
      if (!disposed && current === version && !request.signal.aborted) {
        error.value = 'Não foi possível buscar produtos. Tente novamente.'
      }
    } finally {
      if (!disposed && current === version) {
        loading.value = false
      }
    }
  }
  function open(): void {
    if (props.disabled || expanded.value || returningFocus) {
      return
    }
    expanded.value = true
    page.value = 1
    void search()
  }
  function edit(): void {
    cancelRequest()
    setPending(text.value.trim() !== props.selectedLabel.trim())
    expanded.value = true
    page.value = 1
    result.value = null
    active.value = -1
    error.value = ''
    loading.value = true
    timer = setTimeout(() => void search(), 300)
  }
  function choose(product: ProductView): void {
    if (props.disabled || loading.value) {
      return
    }
    text.value = product.id === props.selectedId ? props.selectedLabel : product.name
    close()
    setPending(false)
    emit('select', product)
    returningFocus = true
    input.value?.focus()
    returningFocus = false
  }
  function clear(): void {
    if (props.disabled) {
      return
    }
    text.value = ''
    setPending(false)
    emit('clear')
    expanded.value = true
    page.value = 1
    void search()
    input.value?.focus()
  }
  async function keys(event: KeyboardEvent): Promise<void> {
    if (event.isComposing) {
      return
    }
    if (event.key === 'Escape' && expanded.value) {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!expanded.value) {
        open()
        return
      }
      if (!items.value.length || loading.value) {
        return
      }
      active.value =
        event.key === 'ArrowDown'
          ? (active.value + 1) % items.value.length
          : active.value <= 0
            ? items.value.length - 1
            : active.value - 1
      await nextTick()
      container.value
        ?.querySelector<HTMLElement>(`#${activeId.value}`)
        ?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      const product = items.value[active.value]
      if (expanded.value && product) {
        choose(product)
      } else if (expanded.value && !loading.value) {
        void search()
      }
    }
  }
  function leave(event: FocusEvent): void {
    // Não deslocar botões entre o foco do pointerdown e o click que executa a ação.
    const target = event.relatedTarget
    const form = input.value?.form
    const dialog = container.value?.closest('dialog')
    if (
      target instanceof HTMLButtonElement &&
      ((form && target.form === form) || (dialog && dialog.contains(target)))
    ) {
      return
    }
    if (!(event.relatedTarget instanceof Node) || !container.value?.contains(event.relatedTarget)) {
      close()
    }
  }
  function changePage(value: number): void {
    page.value = value
    void search()
    input.value?.focus()
  }
  watch(
    () => [props.selectedId, props.selectedLabel] as const,
    () => {
      if (!pending.value) {
        text.value = props.selectedLabel
      }
    },
  )
  watch(
    () => props.disabled,
    (disabled) => {
      if (disabled) {
        close()
      }
    },
  )
  onBeforeUnmount(() => {
    disposed = true
    cancelRequest()
  })
</script>

<template>
  <div
    ref="container"
    class="product-picker"
    @focusout="leave"
  >
    <div class="picker-input">
      <AppIcon name="search" />
      <input
        :id="id"
        ref="input"
        v-model="text"
        type="text"
        role="combobox"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        aria-autocomplete="list"
        :aria-expanded="expanded"
        :aria-controls="expanded ? `${id}-results` : undefined"
        :aria-activedescendant="activeId"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
        aria-required="true"
        :disabled="disabled"
        :maxlength="MAX_PRODUCT_SEARCH_LENGTH"
        placeholder="Digite o nome do produto"
        @focus="open"
        @input="edit"
        @keydown="keys"
      />
      <button
        v-if="text || selectedId"
        type="button"
        class="secondary picker-clear"
        aria-label="Limpar produto"
        :disabled="disabled"
        @mousedown.prevent
        @click="clear"
      >
        <AppIcon name="close" />
      </button>
    </div>
    <p
      :id="`${id}-help`"
      class="help picker-help"
    >
      Busque pelo nome, mesmo sem acentos. Escolha um resultado ou use ↓, ↑ e Enter.
    </p>
    <p
      v-if="pending && selectedId"
      class="help"
    >
      Seleção anterior: {{ selectedLabel }}. Escolha um resultado para trocar o produto.
    </p>
    <div
      v-if="expanded"
      class="picker-results"
    >
      <p
        v-if="loading"
        class="picker-message"
        role="status"
      >
        Buscando produtos…
      </p>
      <div
        v-else-if="error"
        class="picker-message"
        role="alert"
      >
        <p>{{ error }}</p>
        <button
          type="button"
          class="secondary"
          @mousedown.prevent
          @click="search"
        >
          Tentar novamente
        </button>
      </div>
      <p
        v-else-if="result && !items.length"
        class="picker-message"
        role="status"
      >
        Nenhum produto ativo encontrado. Tente outro nome ou cadastre um produto na tela Produtos.
      </p>
      <ul
        :id="`${id}-results`"
        role="listbox"
        aria-label="Produtos encontrados"
        class="picker-options"
        :aria-busy="loading"
      >
        <li
          v-for="(product, index) in items"
          :id="`${id}-option-${index}`"
          :key="product.id"
          role="option"
          :aria-selected="product.id === selectedId"
          :data-product-id="product.id"
          :class="{ 'picker-active': index === active }"
          @mousedown.prevent
          @click="choose(product)"
        >
          <span>{{ product.name }}</span>
          <small>{{ formatCents(product.salePriceCents) }}</small>
        </li>
      </ul>
      <div
        v-if="result && result.total"
        class="picker-footer"
      >
        <span role="status">
          {{ result.total }} encontrado(s) · Página {{ page }} de {{ pages }}
        </span>
        <div
          v-if="pages > 1"
          class="picker-pages"
        >
          <button
            type="button"
            class="secondary"
            aria-label="Produtos encontrados: anterior"
            :disabled="loading || page <= 1"
            @mousedown.prevent
            @click="changePage(page - 1)"
          >
            Anterior
          </button>
          <button
            type="button"
            class="secondary"
            aria-label="Produtos encontrados: próxima"
            :disabled="loading || page >= pages"
            @mousedown.prevent
            @click="changePage(page + 1)"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
