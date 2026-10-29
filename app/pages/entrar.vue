<script setup lang="ts">
  import { computed, nextTick, ref } from 'vue'
  import { validLoginPassword } from '#shared/utils/password'
  import AppIcon from '../components/AppIcon.vue'
  import AuthPanel from '../components/AuthPanel.vue'
  import PasswordInput from '../components/PasswordInput.vue'
  const route = useRoute()
  const notice = computed(() =>
    route.query.status === 'senha-alterada'
      ? 'Senha alterada. Entre com sua nova senha.'
      : route.query.status === 'conta-configurada'
        ? 'Conta configurada. Entre para começar.'
        : '',
  )
  const password = ref('')
  const busy = ref(false)
  const error = ref('')
  const formElement = ref<HTMLFormElement | null>(null)
  async function signIn(): Promise<void> {
    if (busy.value) {
      return
    }
    if (!validLoginPassword(password.value)) {
      error.value = 'Informe sua senha administrativa, com até 128 caracteres.'
      await nextTick()
      formElement.value?.querySelector<HTMLInputElement>('input')?.focus()
      return
    }
    busy.value = true
    error.value = ''
    try {
      await $fetch('/api/auth/login', { method: 'POST', body: { password: password.value } })
      password.value = ''
      await navigateTo('/')
    } catch (cause: unknown) {
      const code =
        typeof cause === 'object' && cause !== null && 'statusCode' in cause
          ? cause.statusCode
          : null
      error.value =
        code === 429
          ? 'Muitas tentativas. Aguarde até quinze minutos e tente novamente.'
          : code === 401
            ? 'Senha inválida. Confira e tente novamente.'
            : 'O acesso está indisponível no momento. Tente novamente em instantes.'
    } finally {
      password.value = ''
      busy.value = false
    }
    if (error.value) {
      await nextTick()
      formElement.value?.querySelector<HTMLInputElement>('input')?.focus()
    }
  }
</script>

<template>
  <AuthPanel
    title="Bem-vindo de volta."
    description="Entre para acompanhar as sugestões do seu negócio."
  >
    <div
      v-if="notice"
      class="success-banner auth-notice"
      role="status"
    >
      <AppIcon name="check" />
      <span>{{ notice }}</span>
    </div>
    <form
      ref="formElement"
      novalidate
      :aria-busy="busy"
      @submit.prevent="signIn"
    >
      <fieldset
        class="record-fields"
        :disabled="busy"
      >
        <label for="admin-password">Senha administrativa</label>
        <PasswordInput
          id="admin-password"
          v-model="password"
          label="senha"
          placeholder="Digite sua senha"
          autocomplete="current-password"
          required
          :conceal="busy"
          :invalid="Boolean(error)"
          :aria-describedby="error ? 'login-help login-error' : 'login-help'"
        />
        <p
          v-if="error"
          id="login-error"
          role="alert"
          class="field-error"
        >
          {{ error }}
        </p>
        <button
          class="login-submit"
          type="submit"
        >
          {{ busy ? 'Verificando…' : 'Entrar no VisãoAtiva' }}
          <AppIcon :name="busy ? 'refresh' : 'arrow'" />
        </button>
      </fieldset>
    </form>
    <p
      id="login-help"
      class="help auth-help"
    >
      Use a senha da sua conta administrativa.
    </p>
  </AuthPanel>
</template>
