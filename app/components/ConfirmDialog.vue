<script setup lang="ts">
  import AppModal from './AppModal.vue'

  defineProps<{
    id: string
    title: string
    description: string
    confirmLabel: string
    busy?: boolean
    error?: string
    danger?: boolean
    fallbackFocus?: string
  }>()
  const emit = defineEmits<{ close: []; confirm: [] }>()
</script>

<template>
  <AppModal
    :id="id"
    :title="title"
    :description="description"
    :busy="busy"
    :error="error"
    :fallback-focus="fallbackFocus"
    role="alertdialog"
    initial-focus=".confirmation-cancel"
    @close="emit('close')"
  >
    <div class="confirmation-details"><slot /></div>
    <div class="actions confirmation-actions">
      <button
        type="button"
        class="secondary confirmation-cancel"
        :disabled="busy"
        @click="emit('close')"
      >
        Cancelar
      </button>
      <button
        type="button"
        :class="{ danger }"
        :disabled="busy"
        @click="!busy && emit('confirm')"
      >
        {{ busy ? 'Processando…' : confirmLabel }}
      </button>
    </div>
  </AppModal>
</template>
