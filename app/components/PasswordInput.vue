<script setup lang="ts">
  import { ref, watch } from 'vue'
  import AppIcon from './AppIcon.vue'

  defineOptions({ inheritAttrs: false })
  const props = defineProps<{
    id: string
    modelValue: string
    label: string
    invalid?: boolean
    disabled?: boolean
    conceal?: boolean
    resetKey?: number
  }>()
  const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
  const visible = ref(false)
  watch(
    () => props.resetKey,
    () => {
      visible.value = false
    },
  )
  watch(
    () => [props.modelValue, props.conceal] as const,
    ([value, conceal]) => {
      if (!value || conceal) {
        visible.value = false
      }
    },
  )
  function input(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      emit('update:modelValue', event.target.value)
    }
  }
</script>

<template>
  <div
    class="password-input"
    :class="{ 'password-input--invalid': invalid }"
  >
    <input
      :id="id"
      v-bind="$attrs"
      :value="modelValue"
      :type="visible ? 'text' : 'password'"
      :disabled="disabled"
      :aria-invalid="Boolean(invalid)"
      @input="input"
    />
    <button
      class="password-toggle"
      type="button"
      :disabled="disabled"
      :aria-label="`${visible ? 'Ocultar' : 'Mostrar'} ${label}`"
      :aria-controls="id"
      :aria-pressed="visible"
      @click="visible = !visible"
    >
      <AppIcon :name="visible ? 'eyeOff' : 'eye'" />
    </button>
  </div>
</template>

<style scoped>
  .password-input {
    display: flex;
    align-items: center;
    min-width: 0;
    border: 1px solid #a5b2c5;
    border-radius: 9px;
    background: var(--surface);
    transition:
      border-color 120ms,
      box-shadow 120ms;
  }
  .password-input:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px #315acb20;
  }
  .password-input--invalid {
    border-color: var(--danger);
  }
  .password-input input {
    flex: 1;
    width: 100%;
    min-width: 0;
    border: 0;
    border-radius: inherit;
    background: transparent;
    padding-right: 0.25rem;
  }
  .password-input input:focus-visible {
    outline: none;
  }
  .password-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 44px;
    min-height: 44px;
    padding: 0.5rem;
    margin: 0;
    border: 0;
    border-radius: 7px;
    color: var(--muted);
    background: transparent;
  }
  .password-toggle:hover:not(:disabled) {
    color: var(--accent);
    background: var(--accent-soft);
  }
</style>
