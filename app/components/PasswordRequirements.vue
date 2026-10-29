<script setup lang="ts">
  import { computed } from 'vue'
  import AppIcon from './AppIcon.vue'
  import { validNewPassword } from '#shared/utils/password'
  const props = defineProps<{ password: string; confirmation: string; currentPassword?: string }>()
  const rules = computed(() => [
    { text: '15 a 128 caracteres, sem quebras de linha', valid: validNewPassword(props.password) },
    ...(props.currentPassword === undefined
      ? []
      : [
          {
            text: 'Diferente da senha atual',
            valid: Boolean(
              props.currentPassword && props.password && props.password !== props.currentPassword,
            ),
          },
        ]),
    {
      text: 'Confirmação igual à nova senha',
      valid: Boolean(props.password && props.confirmation === props.password),
    },
  ])
</script>

<template>
  <ul
    class="password-requirements"
    aria-label="Requisitos da nova senha"
  >
    <li
      v-for="rule in rules"
      :key="rule.text"
      :class="{ fulfilled: rule.valid }"
    >
      <span
        class="requirement-icon"
        aria-hidden="true"
      >
        <AppIcon
          v-if="rule.valid"
          name="check"
        />
        <span
          v-else
          class="requirement-dot"
        />
      </span>
      <span>
        {{ rule.text }}
        <span class="sr-only">: {{ rule.valid ? 'atendido' : 'pendente' }}</span>
      </span>
    </li>
  </ul>
</template>

<style scoped>
  .password-requirements {
    list-style: none;
    padding: 0.95rem 1rem;
    margin: 1.25rem 0 0;
    border-radius: 9px;
    background: #f6f8fc;
    display: grid;
    gap: 0.5rem;
    color: var(--muted);
    font-size: 0.78rem;
  }
  .password-requirements li {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }
  .fulfilled {
    color: #246348;
  }
  .requirement-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  .requirement-icon .app-icon {
    width: 16px;
    height: 16px;
  }
  .requirement-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #7d8ba1;
  }
</style>
