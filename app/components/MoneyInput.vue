<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { formatCents, parseCurrencyInput } from '#shared/utils/money'
  import { currencyCaretPosition, maskCurrencyInput } from '../utils/currency-mask'

  defineOptions({ inheritAttrs: false })
  const props = defineProps<{ id: string; modelValue: string }>()
  const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
  function formatted(value: string): string {
    const cents = parseCurrencyInput(value)
    return cents === null ? value : formatCents(cents)
  }
  const display = ref(formatted(props.modelValue))
  const value = ref(props.modelValue)
  const composing = ref(false)
  watch(
    () => props.modelValue,
    (incoming) => {
      if (incoming !== value.value) {
        value.value = incoming
        display.value = formatted(incoming)
      }
    },
  )
  function input(event: Event): void {
    if (!(event.target instanceof HTMLInputElement) || composing.value) {
      return
    }
    const element = event.target
    let source = element.value
    const start = element.selectionStart ?? source.length
    const end = element.selectionEnd ?? start
    const direction = element.selectionDirection ?? undefined
    // O ponto digitado (inclusive no teclado numérico) representa a vírgula decimal.
    // Na colagem, os separadores continuam sendo verificados pelo parser estrito.
    if (
      event instanceof InputEvent &&
      event.inputType === 'insertText' &&
      event.data === '.' &&
      source[start - 1] === '.'
    ) {
      source = `${source.slice(0, start - 1)},${source.slice(start)}`
    }
    const masked = maskCurrencyInput(source, display.value)
    value.value = masked?.value ?? source
    display.value = masked?.display ?? source
    // Atualiza o DOM antes do próximo render para preservar a posição da seleção.
    element.value = display.value
    if (masked) {
      element.setSelectionRange(
        currencyCaretPosition(source, start, display.value),
        currencyCaretPosition(source, end, display.value),
        direction,
      )
    }
    emit('update:modelValue', value.value)
  }
  function blur(): void {
    if (parseCurrencyInput(value.value) !== null) {
      display.value = formatted(value.value)
    }
    emit('update:modelValue', value.value)
  }
  function beforeInput(event: InputEvent): void {
    if (composing.value || !event.cancelable || !(event.target instanceof HTMLInputElement)) {
      return
    }
    const element = event.target
    const position = element.selectionStart
    if (position === null || position !== element.selectionEnd) {
      return
    }
    const backward = event.inputType === 'deleteContentBackward'
    if (!backward && event.inputType !== 'deleteContentForward') {
      return
    }
    let index = backward ? position - 1 : position
    if (element.value[index] !== '.') {
      return
    }
    index += backward ? -1 : 1
    if (!/\d/.test(element.value[index] ?? '')) {
      return
    }
    event.preventDefault()
    element.value = element.value.slice(0, index) + element.value.slice(index + 1)
    element.setSelectionRange(index, index)
    input(event)
  }
  function compositionEnd(event: CompositionEvent): void {
    composing.value = false
    input(event)
  }
</script>

<template>
  <input
    :id="id"
    v-bind="$attrs"
    :value="display"
    type="text"
    inputmode="decimal"
    autocomplete="off"
    placeholder="R$ 0,00"
    @beforeinput="beforeInput"
    @input="input"
    @blur="blur"
    @compositionstart="composing = true"
    @compositionend="compositionEnd"
  />
</template>
