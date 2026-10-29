<script setup lang="ts">
  import { nextTick, reactive, ref, watch } from 'vue'
  import AuthPanel from '../components/AuthPanel.vue'
  import AppIcon from '../components/AppIcon.vue'
  import PasswordInput from '../components/PasswordInput.vue'
  import PasswordRequirements from '../components/PasswordRequirements.vue'
  import { validNewPassword } from '#shared/utils/password'
  const password = ref('')
  const confirmation = ref('')
  const busy = ref(false)
  const complete = ref(false)
  const unavailable = ref(false)
  const error = ref('')
  const formElement = ref<HTMLFormElement | null>(null)
  const feedback = ref<HTMLElement | null>(null)
  const errors = reactive({ password: '', confirmation: '' })
  watch(password, () => {
    errors.password = ''
  })
  watch(confirmation, () => {
    errors.confirmation = ''
  })
  async function submit(): Promise<void> {
    if (busy.value || complete.value || unavailable.value) {
      return
    }
    errors.password = validNewPassword(password.value)
      ? ''
      : 'Use de 15 a 128 caracteres, sem quebras de linha ou controles.'
    errors.confirmation =
      password.value && password.value === confirmation.value
        ? ''
        : 'Repita a mesma senha nos dois campos.'
    error.value = ''
    if (errors.password || errors.confirmation) {
      await nextTick()
      formElement.value?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus()
      return
    }
    busy.value = true
    try {
      await $fetch('/api/auth/setup', {
        method: 'POST',
        body: { password: password.value, confirmation: confirmation.value },
      })
      complete.value = true
    } catch (cause: unknown) {
      const status =
        typeof cause === 'object' && cause !== null && 'statusCode' in cause
          ? cause.statusCode
          : null
      unavailable.value = status === 409
      error.value =
        status === 409
          ? 'A conta já está configurada. Entre com sua senha.'
          : status === 429
            ? 'Muitas tentativas. Aguarde quinze minutos antes de tentar novamente.'
            : 'Não foi possível configurar a conta. Confira a conexão e tente novamente.'
    } finally {
      password.value = ''
      confirmation.value = ''
      busy.value = false
    }
    if (error.value) {
      await nextTick()
      feedback.value?.focus()
    }
    if (complete.value) {
      try {
        await navigateTo('/entrar?status=conta-configurada', { replace: true })
      } catch {
        /* A confirmação continua disponível se a navegação falhar. */
      }
    }
  }
</script>

<template>
  <AuthPanel
    title="Seu primeiro acesso."
    description="Defina uma senha para começar a cuidar dos registros do seu negócio."
  >
    <div
      v-if="complete"
      role="status"
      class="success-banner auth-notice"
    >
      <p>Conta configurada. Entre com sua senha para continuar.</p>
      <a
        class="secondary-link"
        href="/entrar?status=conta-configurada"
      >
        Ir para o login
        <AppIcon name="arrow" />
      </a>
    </div>
    <template v-else>
      <div
        v-if="error"
        id="setup-error"
        ref="feedback"
        role="alert"
        tabindex="-1"
        class="error-banner auth-notice"
      >
        {{ error }}
      </div>
      <form
        v-if="!unavailable"
        ref="formElement"
        novalidate
        :aria-busy="busy"
        @submit.prevent="submit"
      >
        <fieldset
          class="record-fields"
          :disabled="busy"
        >
          <label for="setup-password">Crie sua senha</label>
          <PasswordInput
            id="setup-password"
            v-model="password"
            label="senha"
            autocomplete="new-password"
            required
            :conceal="busy"
            :invalid="Boolean(errors.password)"
            :aria-describedby="
              errors.password ? 'setup-password-help setup-password-error' : 'setup-password-help'
            "
          />
          <p
            v-if="errors.password"
            id="setup-password-error"
            role="alert"
            class="field-error"
          >
            {{ errors.password }}
          </p>
          <label for="setup-confirmation">Confirme sua senha</label>
          <PasswordInput
            id="setup-confirmation"
            v-model="confirmation"
            label="confirmação da senha"
            autocomplete="new-password"
            required
            :conceal="busy"
            :invalid="Boolean(errors.confirmation)"
            :aria-describedby="errors.confirmation ? 'setup-confirmation-error' : undefined"
          />
          <p
            v-if="errors.confirmation"
            id="setup-confirmation-error"
            role="alert"
            class="field-error"
          >
            {{ errors.confirmation }}
          </p>
          <p
            id="setup-password-help"
            class="sr-only"
          >
            Use de 15 a 128 caracteres, sem controles ou quebras de linha.
          </p>
          <PasswordRequirements
            :password="password"
            :confirmation="confirmation"
          />
          <button
            class="login-submit"
            type="submit"
          >
            {{ busy ? 'Configurando…' : 'Configurar conta administrativa' }}
            <AppIcon :name="busy ? 'refresh' : 'arrow'" />
          </button>
        </fieldset>
      </form>
      <a
        v-if="unavailable"
        class="secondary-link"
        href="/entrar"
      >
        Ir para o login
      </a>
      <p class="help auth-help">
        Esta etapa acontece uma única vez. Guarde a senha em um local seguro.
      </p>
    </template>
  </AuthPanel>
</template>
