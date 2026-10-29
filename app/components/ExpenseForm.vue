<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import MoneyInput from './MoneyInput.vue'
  import { focusFirstInvalid } from '../utils/focus-form'
  import type { ExpenseInput, ExpenseView } from '#shared/types/operations'
  import { formatMoneyInput, parseCurrencyInput } from '#shared/utils/money'
  import { parseCivilDate } from '#shared/utils/dates'

  const props = defineProps<{ initial?: ExpenseView | null; defaultDate: string; busy?: boolean }>()
  const formElement = ref<HTMLFormElement | null>(null)
  const emit = defineEmits<{ submit: [value: ExpenseInput]; cancel: [] }>()
  const form = reactive({
    date: props.initial?.date ?? props.defaultDate,
    category: props.initial?.category ?? '',
    description: props.initial?.description ?? '',
    amount: props.initial ? formatMoneyInput(props.initial.amountCents) : '',
  })
  const errors = reactive({ date: '', category: '', description: '', amount: '' })
  async function submit(): Promise<void> {
    if (props.busy) {
      return
    }
    const amountCents = parseCurrencyInput(form.amount)
    const category = form.category.trim()
    const description = form.description.trim()
    errors.date = parseCivilDate(form.date) ? '' : 'Informe uma data válida.'
    errors.category =
      category.length > 0 && category.length <= 80 && !/\p{Cc}/u.test(category)
        ? ''
        : 'Informe uma categoria de 1 a 80 caracteres, sem controles.'
    errors.description =
      description.length <= 500 && !/\p{Cc}/u.test(description)
        ? ''
        : 'Use até 500 caracteres, sem controles.'
    errors.amount = amountCents === null ? 'Informe um valor válido, até R$ 21.474.836,47.' : ''
    if (Object.values(errors).some(Boolean) || amountCents === null) {
      await focusFirstInvalid(formElement.value)
      return
    }
    emit('submit', { date: form.date, category, description: description || null, amountCents })
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
      <legend>{{ initial ? 'Corrigir despesa' : 'Registrar despesa' }}</legend>
      <label for="expense-date">Data da despesa</label>
      <input
        id="expense-date"
        v-model="form.date"
        type="date"
        min="0001-01-01"
        max="9999-12-31"
        :aria-invalid="Boolean(errors.date)"
        :aria-describedby="errors.date ? 'expense-date-error' : undefined"
      />
      <p
        v-if="errors.date"
        id="expense-date-error"
        role="alert"
        class="field-error"
      >
        {{ errors.date }}
      </p>
      <label for="expense-category">Categoria</label>
      <input
        id="expense-category"
        v-model="form.category"
        type="text"
        maxlength="80"
        :aria-invalid="Boolean(errors.category)"
        :aria-describedby="errors.category ? 'expense-category-error' : undefined"
      />
      <p
        v-if="errors.category"
        id="expense-category-error"
        role="alert"
        class="field-error"
      >
        {{ errors.category }}
      </p>
      <label for="expense-amount">Valor da despesa (R$)</label>
      <MoneyInput
        id="expense-amount"
        v-model="form.amount"
        :aria-invalid="Boolean(errors.amount)"
        :aria-describedby="errors.amount ? 'expense-amount-error' : undefined"
      />
      <p
        v-if="errors.amount"
        id="expense-amount-error"
        role="alert"
        class="field-error"
      >
        {{ errors.amount }}
      </p>
      <label for="expense-description">Descrição (opcional)</label>
      <input
        id="expense-description"
        v-model="form.description"
        type="text"
        maxlength="500"
        :aria-invalid="Boolean(errors.description)"
        :aria-describedby="errors.description ? 'expense-description-error' : undefined"
      />
      <p
        v-if="errors.description"
        id="expense-description-error"
        role="alert"
        class="field-error"
      >
        {{ errors.description }}
      </p>
      <p class="help">
        Digite 10,50 ou cole R$ 1.234,56. A máscara acompanha a digitação; as duas casas decimais
        são completadas ao sair. Zero deve ser informado explicitamente.
      </p>
      <div class="actions">
        <button type="submit">
          {{ busy ? 'Aguarde…' : initial ? 'Salvar correção da despesa' : 'Registrar despesa' }}
        </button>
        <button
          v-if="initial"
          type="button"
          class="secondary"
          @click="emit('cancel')"
        >
          Cancelar correção da despesa
        </button>
      </div>
    </fieldset>
  </form>
</template>
