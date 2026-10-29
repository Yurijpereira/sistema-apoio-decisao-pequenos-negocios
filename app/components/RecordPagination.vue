<script setup lang="ts">
  import { computed } from 'vue'
  const props = defineProps<{
    page: number
    total: number
    pageSize: number
    label: string
    busy?: boolean
  }>()
  const emit = defineEmits<{ change: [page: number] }>()
  const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
</script>

<template>
  <nav
    class="record-pagination"
    :aria-label="label"
  >
    <button
      type="button"
      class="secondary"
      :disabled="busy || page <= 1"
      :aria-label="`${label}: anterior`"
      @click="emit('change', page - 1)"
    >
      Anterior
    </button>
    <span>Página {{ page }} de {{ pages }} · {{ total }} registro(s)</span>
    <button
      type="button"
      class="secondary"
      :disabled="busy || page >= pages"
      :aria-label="`${label}: próxima`"
      @click="emit('change', page + 1)"
    >
      Próxima
    </button>
  </nav>
</template>
