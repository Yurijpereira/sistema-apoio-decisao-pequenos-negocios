<template>
  <!-- ruleid: no-vue-raw-html -->
  <div v-html="input" />
  <!-- ok: no-vue-raw-html -->
  <div>{{ input }}</div>
</template>
