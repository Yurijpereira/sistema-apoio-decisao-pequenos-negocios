<script setup lang="ts">
  const paths = {
    overview: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
    products: ['m12 3 9 5-9 5-9-5 9-5Z', 'M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5'],
    records: [
      'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3',
      'M8 8h8M8 13h4M15 3h6v6M21 3l-9 9',
    ],
    logout: ['M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 8l4 4-4 4M8 12h13'],
    arrow: ['M4 12h16M14 6l6 6-6 6'],
    plus: ['M12 5v14M5 12h14'],
    refresh: ['M20 7v5h-5M4 17v-5h5', 'M6 6a8 8 0 0 1 13 2l1 4M4 12l1 4a8 8 0 0 0 13 2'],
    calendar: [
      'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM16 3v4M8 3v4M3 11h18M8 15h2M14 15h2',
    ],
    shield: ['m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z', 'm8 12 3 3 5-6'],
    alert: ['m12 3 10 18H2L12 3ZM12 9v4M12 17h.01'],
    brand: ['M4 18 10 11l4 4 7-10M15 5h6v6', 'M4 4v14h17'],
    eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z', 'M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0'],
    eyeOff: [
      'm3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.5 5.3A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.1 6.1A19 19 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.9-1.8',
    ],
    check: ['m5 12 4 4L19 6'],
    user: ['M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M4 21v-2a8 8 0 0 1 16 0v2'],
    lock: [
      'M7 10V7a5 5 0 0 1 10 0v3M6 10h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM12 14v3',
    ],
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
