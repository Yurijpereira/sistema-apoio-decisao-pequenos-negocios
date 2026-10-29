<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import MoneyInput from './MoneyInput.vue'
  import { focusFirstInvalid } from '../utils/focus-form'
  import type { ProductInput } from '#shared/types/product'
  import { formatMoneyInput, parseCurrencyInput } from '#shared/utils/money'

  const props = defineProps<{ initial?: ProductInput | null; busy?: boolean }>()
  const formElement = ref<HTMLFormElement | null>(null)
  const emit = defineEmits<{ submit: [input: ProductInput]; cancel: [] }>()
  const form = reactive({
    name: props.initial?.name ?? '',
    salePrice: props.initial ? formatMoneyInput(props.initial.salePriceCents) : '',
    unitCost: props.initial ? formatMoneyInput(props.initial.unitCostCents) : '',
  })
  const errors = reactive({ name: '', salePrice: '', unitCost: '' })
  async function submit(): Promise<void> {
    if (props.busy) {
      return
    }
    const name = form.name.trim()
    const salePriceCents = parseCurrencyInput(form.salePrice)
    const unitCostCents = parseCurrencyInput(form.unitCost)
    errors.name =
      name.length < 1 || name.length > 120 || /\p{Cc}/u.test(name)
        ? 'Informe um nome de 1 a 120 caracteres, sem quebras de linha.'
        : ''
    errors.salePrice =
      salePriceCents === null
        ? 'Informe um valor entre R$ 0,00 e R$ 21.474.836,47, com até duas casas decimais.'
        : ''
    errors.unitCost =
      unitCostCents === null
        ? 'Informe um valor entre R$ 0,00 e R$ 21.474.836,47, com até duas casas decimais.'
        : ''
    if (errors.name || salePriceCents === null || unitCostCents === null) {
      await focusFirstInvalid(formElement.value)
      return
    }
    emit('submit', { name, salePriceCents, unitCostCents })
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
      class="record-fields"
      :disabled="busy"
    >
      <legend>{{ initial ? 'Editar produto' : 'Cadastrar produto' }}</legend>
      <label for="product-name">Nome do produto</label>
      <input
        id="product-name"
        v-model="form.name"
        type="text"
        placeholder="Ex.: pão integral"
        maxlength="120"
        required
        :aria-invalid="Boolean(errors.name)"
        :aria-describedby="errors.name ? 'name-error' : undefined"
      />
      <p
        v-if="errors.name"
        id="name-error"
        class="field-error"
        role="alert"
      >
        {{ errors.name }}
      </p>
      <div class="money-fields">
        <div>
          <label for="sale-price">Preço de venda (R$)</label>
          <MoneyInput
            id="sale-price"
            v-model="form.salePrice"
            required
            :aria-invalid="Boolean(errors.salePrice)"
            :aria-describedby="errors.salePrice ? 'money-help price-error' : 'money-help'"
          />
          <p
            v-if="errors.salePrice"
            id="price-error"
            class="field-error"
            role="alert"
          >
            {{ errors.salePrice }}
          </p>
        </div>
        <div>
          <label for="unit-cost">Custo unitário estimado (R$)</label>
          <MoneyInput
            id="unit-cost"
            v-model="form.unitCost"
            required
            :aria-invalid="Boolean(errors.unitCost)"
            :aria-describedby="errors.unitCost ? 'money-help cost-error' : 'money-help'"
          />
          <p
            v-if="errors.unitCost"
            id="cost-error"
            class="field-error"
            role="alert"
          >
            {{ errors.unitCost }}
          </p>
        </div>
      </div>
      <p
        id="money-help"
        class="help"
      >
        Digite 10,50 ou cole R$ 1.234,56. A máscara acompanha a digitação e completa as casas
        decimais ao sair; vazio não equivale a zero.
      </p>
      <div class="actions">
        <button type="submit">
          {{ busy ? 'Salvando…' : initial ? 'Salvar alterações' : 'Cadastrar produto' }}
        </button>
        <button
          v-if="initial"
          type="button"
          class="secondary"
          data-testid="cancel-edit"
          @click="emit('cancel')"
        >
          Cancelar edição
        </button>
      </div>
    </fieldset>
  </form>
</template>

<style scoped>
  fieldset {
    padding: 0;
    border: 0;
    margin: 0;
    min-width: 0;
  }
  input {
    width: 100%;
  }
  .money-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
  }
  @media (min-width: 74.01rem) {
    .money-fields {
      grid-template-columns: 1fr;
      gap: 0;
    }
  }
  @media (max-width: 36rem) {
    .money-fields {
      grid-template-columns: 1fr;
      gap: 0;
    }
  }
</style>
