<script setup lang="ts">
  const paths = {
    home: ['m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8'],
    overview: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
    products: ['m12 3 9 5-9 5-9-5 9-5Z', 'M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5'],
    records: [
      'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3',
      'M8 8h8M8 13h4M15 3h6v6M21 3l-9 9',
    ],
    arrow: ['M4 12h16M14 6l6 6-6 6'],
    plus: ['M12 5v14M5 12h14'],
    close: ['m6 6 12 12M6 18 18 6'],
    search: ['M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15M16 16l5 5'],
    refresh: ['M20 7v5h-5M4 17v-5h5', 'M6 6a8 8 0 0 1 13 2l1 4M4 12l1 4a8 8 0 0 0 13 2'],
    calendar: [
      'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM16 3v4M8 3v4M3 11h18M8 15h2M14 15h2',
    ],
    shield: ['m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z', 'm8 12 3 3 5-6'],
    alert: ['m12 3 10 18H2L12 3ZM12 9v4M12 17h.01'],
    brand: ['M4 18 10 11l4 4 7-10M15 5h6v6', 'M4 4v14h17'],
    check: ['m5 12 4 4L19 6'],
  } as const
  defineProps<{ name: keyof typeof paths }>()
</script>

<template>
  <svg
    class="app-icon"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path
      v-for="path in paths[name]"
      :key="path"
      :d="path"
    />
  </svg>
</template>
