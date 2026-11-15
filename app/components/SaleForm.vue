<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue'
  import ProductPicker from './ProductPicker.vue'
  import MoneyInput from './MoneyInput.vue'
  import { watchFormChanges } from '../utils/form-changes'
  import { focusFirstInvalid } from '../utils/focus-form'
  import type { ProductView } from '#shared/types/product'
  import { MAX_SALE_QUANTITY, type SaleInput, type SaleView } from '#shared/types/operations'
  import { formatMoneyInput, parseCurrencyInput } from '#shared/utils/money'
  import { parseCivilDate } from '#shared/utils/dates'

  const props = defineProps<{
    initial?: SaleView | null
    defaultDate: string
    busy?: boolean
    inDialog?: boolean
  }>()
  const formElement = ref<HTMLFormElement | null>(null)
  const emit = defineEmits<{
    submit: [value: SaleInput]
    cancel: []
    'dirty-change': [dirty: boolean]
  }>()
  const selected = ref<ProductView | null>(null)
  const form = reactive({
    productId: props.initial?.productId ?? '',
    date: props.initial?.date ?? props.defaultDate,
    quantity: String(props.initial?.quantity ?? 1),
    price: props.initial ? formatMoneyInput(props.initial.unitPriceCents) : '',
    cost: props.initial ? formatMoneyInput(props.initial.unitCostCents) : '',
  })
  const productPending = ref(false)
  const formDirty = ref(false)
  const selectedLabel = computed(() =>
    form.productId === props.initial?.productId
      ? `${props.initial.productNameSnapshot} (venda registrada)`
      : (selected.value?.name ?? ''),
  )
  watchFormChanges(form, (dirty) => {
    formDirty.value = dirty
  })
  watch([formDirty, productPending], ([dirty, pending]) => emit('dirty-change', dirty || pending), {
    immediate: true,
  })
  const errors = reactive({ product: '', date: '', quantity: '', price: '', cost: '' })
  function chooseProduct(product: ProductView): void {
    productPending.value = false
    errors.product = ''
    if (form.productId === product.id) {
      return
    }
    selected.value = product
    form.productId = product.id
    const original = props.initial?.productId === product.id ? props.initial : null
    form.price = formatMoneyInput(original?.unitPriceCents ?? product.salePriceCents)
    form.cost = formatMoneyInput(original?.unitCostCents ?? product.unitCostCents)
  }
  function clearProduct(): void {
    form.productId = ''
    selected.value = null
    productPending.value = false
  }
  async function submit(): Promise<void> {
    if (props.busy) {
      return
    }
    const price = parseCurrencyInput(form.price)
    const cost = parseCurrencyInput(form.cost)
    const quantity = Number(form.quantity)
    errors.product =
      form.productId && !productPending.value ? '' : 'Escolha um produto nos resultados da busca.'
    errors.date = parseCivilDate(form.date) ? '' : 'Informe uma data válida.'
    errors.quantity =
      /^[1-9]\d*$/.test(form.quantity) && quantity <= MAX_SALE_QUANTITY
        ? ''
        : 'Informe uma quantidade inteira entre 1 e 1.000.000, sem separadores.'
    errors.price = price === null ? 'Informe um preço válido, até R$ 21.474.836,47.' : ''
    errors.cost = cost === null ? 'Informe um custo válido, até R$ 21.474.836,47.' : ''
    if (Object.values(errors).some(Boolean) || price === null || cost === null) {
      await focusFirstInvalid(formElement.value)
      return
    }
    emit('submit', {
      productId: form.productId,
      date: form.date,
      quantity,
      unitPriceCents: price,
      unitCostCents: cost,
    })
  }
</script>

<template>
  <form
    ref="formElement"
    novalidate
    :aria-busy="busy"
    @submit.prevent="submit"
  >
    <fieldset
      :disabled="busy"
      class="record-fields"
    >
      <legend :class="{ 'sr-only': inDialog }">
        {{ initial ? 'Corrigir venda' : 'Registrar venda' }}
      </legend>
      <label for="sale-product">Produto</label>
      <ProductPicker
        id="sale-product"
        :selected-id="form.productId"
        :selected-label="selectedLabel"
        :disabled="busy"
        :invalid="Boolean(errors.product)"
        error-id="sale-product-error"
        @select="chooseProduct"
        @clear="clearProduct"
        @pending-change="productPending = $event"
      />
      <p
        v-if="errors.product"
        id="sale-product-error"
        role="alert"
        class="field-error"
      >
        {{ errors.product }}
      </p>
      <label for="sale-date">Data da venda</label>
      <input
        id="sale-date"
        v-model="form.date"
        type="date"
        min="0001-01-01"
        max="9999-12-31"
        :aria-invalid="Boolean(errors.date)"
        :aria-describedby="errors.date ? 'sale-date-error' : undefined"
      />
      <p
        v-if="errors.date"
        id="sale-date-error"
        role="alert"
        class="field-error"
      >
        {{ errors.date }}
      </p>
      <label for="sale-quantity">Quantidade inteira</label>
      <input
        id="sale-quantity"
        v-model="form.quantity"
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        :aria-invalid="Boolean(errors.quantity)"
        :aria-describedby="
          errors.quantity ? 'sale-quantity-help sale-quantity-error' : 'sale-quantity-help'
        "
      />
      <p
        id="sale-quantity-help"
        class="help"
      >
        De 1 a 1.000.000 unidades, sem casas decimais ou separadores.
      </p>
      <p
        v-if="errors.quantity"
        id="sale-quantity-error"
        role="alert"
        class="field-error"
      >
        {{ errors.quantity }}
      </p>
      <label for="sale-unit-price">Preço unitário na venda (R$)</label>
      <MoneyInput
        id="sale-unit-price"
        v-model="form.price"
        :aria-invalid="Boolean(errors.price)"
        :aria-describedby="errors.price ? 'sale-price-error' : undefined"
      />
      <p
        v-if="errors.price"
        id="sale-price-error"
        role="alert"
        class="field-error"
      >
        {{ errors.price }}
      </p>
      <label for="sale-unit-cost">Custo unitário na venda (R$)</label>
      <MoneyInput
        id="sale-unit-cost"
        v-model="form.cost"
        :aria-invalid="Boolean(errors.cost)"
        :aria-describedby="errors.cost ? 'sale-cost-error' : undefined"
      />
      <p
        v-if="errors.cost"
        id="sale-cost-error"
        role="alert"
        class="field-error"
      >
        {{ errors.cost }}
      </p>
      <p class="help">
        Preço e custo ficam guardados nesta venda. Na correção, os valores históricos são mantidos
        até você alterá-los explicitamente. Trocar o produto preenche os valores do novo cadastro.
      </p>
      <div class="actions">
        <button
          v-if="initial || inDialog"
          type="button"
          class="secondary"
          @click="emit('cancel')"
        >
          {{ initial ? 'Cancelar correção da venda' : 'Cancelar' }}
        </button>

        <button type="submit">
          {{ busy ? 'Aguarde…' : initial ? 'Salvar correção da venda' : 'Registrar venda' }}
        </button>
      </div>
    </fieldset>
  </form>
</template>
