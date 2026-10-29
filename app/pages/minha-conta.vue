<script setup lang="ts">
  import { nextTick, reactive, ref, watch } from 'vue'
  import AppIcon from '../components/AppIcon.vue'
  import PasswordInput from '../components/PasswordInput.vue'
  import PasswordRequirements from '../components/PasswordRequirements.vue'
  import { validLoginPassword, validNewPassword } from '#shared/utils/password'

  const form = reactive({ currentPassword: '', password: '', confirmation: '' })
  const errors = reactive({ currentPassword: '', password: '', confirmation: '' })
  const formElement = ref<HTMLFormElement | null>(null)
  const feedback = ref<HTMLElement | null>(null)
  const busy = ref(false)
  const complete = ref(false)
  const error = ref('')
  const sessionInvalid = ref(false)
  const visibilityReset = ref(0)
  watch(
    () => form.currentPassword,
    () => {
      errors.currentPassword = ''
    },
  )
  watch(
    () => form.password,
    () => {
      errors.password = ''
    },
  )
  watch(
    () => form.confirmation,
    () => {
      errors.confirmation = ''
    },
  )
  function clearPasswords(): void {
    form.currentPassword = ''
    form.password = ''
    form.confirmation = ''
  }
  async function submit(): Promise<void> {
    if (busy.value || complete.value) {
      return
    }
    error.value = ''
    sessionInvalid.value = false
    errors.currentPassword = validLoginPassword(form.currentPassword)
      ? ''
      : 'Informe sua senha atual.'
    errors.password = !validNewPassword(form.password)
      ? 'Use de 15 a 128 caracteres, sem quebras de linha ou controles.'
      : form.password === form.currentPassword
        ? 'Escolha uma senha diferente da atual.'
        : ''
    errors.confirmation =
      form.password && form.password === form.confirmation
        ? ''
        : 'Repita a mesma nova senha nos dois campos.'
    if (Object.values(errors).some(Boolean)) {
      await nextTick()
      formElement.value?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus()
      return
    }
    busy.value = true
    let currentPasswordInvalid = false
    try {
      await $fetch('/api/auth/password', { method: 'PUT', body: { ...form } })
      complete.value = true
    } catch (cause: unknown) {
      const status =
        typeof cause === 'object' && cause !== null && 'statusCode' in cause
          ? cause.statusCode
          : null
      if (status === 401) {
        try {
          const session = await $fetch<{ authenticated: boolean }>('/api/auth/session')
          currentPasswordInvalid = session.authenticated === true
        } catch {
          sessionInvalid.value = true
        }
        if (!currentPasswordInvalid) {
          sessionInvalid.value = true
          error.value = 'Sua sessão expirou. Entre novamente para alterar a senha.'
        }
      } else {
        error.value =
          status === 429
            ? 'Muitas tentativas. Aguarde quinze minutos antes de tentar novamente.'
            : 'Não foi possível concluir a solicitação. Confira a conexão e tente novamente.'
      }
    } finally {
      if (currentPasswordInvalid) {
        form.currentPassword = ''
      } else {
        clearPasswords()
      }
      busy.value = false
      visibilityReset.value++
    }
    await nextTick()
    if (currentPasswordInvalid) {
      errors.currentPassword = 'A senha atual está incorreta. Confira e tente novamente.'
      await nextTick()
      formElement.value?.querySelector<HTMLInputElement>('#account-current-password')?.focus()
    } else if (error.value) {
      feedback.value?.focus()
    }
    if (complete.value) {
      try {
        await navigateTo('/entrar?status=senha-alterada', { replace: true })
      } catch {
        // A confirmação e seu link permanecem disponíveis se a navegação falhar.
      }
    }
  }
</script>

<template>
  <main
    id="main-content"
    class="welcome account-page"
    tabindex="-1"
    aria-labelledby="account-title"
  >
    <header class="page-header">
      <p class="eyebrow">PREFERÊNCIAS</p>
      <h1 id="account-title">Minha conta</h1>
      <p class="intro">Um lugar para cuidar do seu acesso ao VisãoAtiva.</p>
    </header>
    <div class="account-layout">
      <section
        class="panel account-card"
        aria-labelledby="password-title"
      >
        <header class="account-card-heading">
          <span class="icon-tile"><AppIcon name="lock" /></span>
          <div>
            <h2 id="password-title">Alterar senha</h2>
            <p>Escolha uma nova senha e confirme sua identidade.</p>
          </div>
        </header>
        <div
          v-if="complete"
          role="status"
          class="success-banner"
        >
          <p>Senha alterada. Entre novamente com sua nova senha.</p>
          <a
            class="secondary-link"
            href="/entrar?status=senha-alterada"
          >
            Ir para o login
            <AppIcon name="arrow" />
          </a>
        </div>
        <template v-else>
          <div
            v-if="error"
            ref="feedback"
            role="alert"
            tabindex="-1"
            class="error-banner account-feedback"
          >
            <p>{{ error }}</p>
            <a
              v-if="sessionInvalid"
              class="secondary-link"
              href="/entrar"
            >
              Entrar novamente
            </a>
          </div>
          <form
            v-if="!sessionInvalid"
            ref="formElement"
            novalidate
            :aria-busy="busy"
            @submit.prevent="submit"
          >
            <fieldset
              class="record-fields"
              :disabled="busy"
            >
              <div class="account-current-field">
                <label for="account-current-password">Senha atual</label>
                <PasswordInput
                  id="account-current-password"
                  v-model="form.currentPassword"
                  label="senha atual"
                  autocomplete="current-password"
                  required
                  :conceal="busy"
                  :reset-key="visibilityReset"
                  :invalid="Boolean(errors.currentPassword)"
                  :aria-describedby="errors.currentPassword ? 'account-current-error' : undefined"
                />
                <p
                  v-if="errors.currentPassword"
                  id="account-current-error"
                  role="alert"
                  class="field-error"
                >
                  {{ errors.currentPassword }}
                </p>
              </div>
              <div class="account-new-fields">
                <div>
                  <label for="account-password">Nova senha</label>
                  <PasswordInput
                    id="account-password"
                    v-model="form.password"
                    label="nova senha"
                    autocomplete="new-password"
                    required
                    :conceal="busy"
                    :reset-key="visibilityReset"
                    :invalid="Boolean(errors.password)"
                    :aria-describedby="
                      errors.password
                        ? 'account-password-help account-password-error'
                        : 'account-password-help'
                    "
                  />
                  <p
                    v-if="errors.password"
                    id="account-password-error"
                    role="alert"
                    class="field-error"
                  >
                    {{ errors.password }}
                  </p>
                </div>
                <div>
                  <label for="account-confirmation">Confirme a nova senha</label>
                  <PasswordInput
                    id="account-confirmation"
                    v-model="form.confirmation"
                    label="confirmação da nova senha"
                    autocomplete="new-password"
                    required
                    :conceal="busy"
                    :reset-key="visibilityReset"
                    :invalid="Boolean(errors.confirmation)"
                    :aria-describedby="
                      errors.confirmation ? 'account-confirmation-error' : undefined
                    "
                  />
                  <p
                    v-if="errors.confirmation"
                    id="account-confirmation-error"
                    role="alert"
                    class="field-error"
                  >
                    {{ errors.confirmation }}
                  </p>
                </div>
              </div>
              <p
                id="account-password-help"
                class="sr-only"
              >
                Use de 15 a 128 caracteres, sem controles. A nova senha deve ser diferente da atual.
              </p>
              <PasswordRequirements
                :password="form.password"
                :confirmation="form.confirmation"
                :current-password="form.currentPassword"
              />
              <footer class="account-form-footer">
                <p>
                  <AppIcon name="shield" />
                  Após salvar, você entrará novamente.
                </p>
                <div class="actions">
                  <a
                    class="secondary-link"
                    href="/"
                  >
                    Cancelar
                  </a>
                  <button type="submit">
                    <AppIcon :name="busy ? 'refresh' : 'lock'" />
                    {{ busy ? 'Salvando…' : 'Salvar senha' }}
                  </button>
                </div>
              </footer>
            </fieldset>
          </form>
        </template>
      </section>
      <aside
        class="panel account-summary"
        aria-labelledby="account-summary-title"
      >
        <div class="account-summary-avatar"><AppIcon name="user" /></div>
        <span class="account-role">CONTA ADMINISTRATIVA</span>
        <h2 id="account-summary-title">Seu acesso, sob seu controle.</h2>
        <p>Uma senha pessoal ajuda a manter seus registros protegidos.</p>
        <ul>
          <li>
            <AppIcon name="check" />
            <span>Você confirma a senha atual antes de alterar.</span>
          </li>
          <li>
            <AppIcon name="check" />
            <span>A nova senha vale assim que a alteração é concluída.</span>
          </li>
          <li>
            <AppIcon name="check" />
            <span>As sessões anteriores são encerradas.</span>
          </li>
        </ul>
        <p class="account-summary-note">Guarde a nova senha em um local seguro.</p>
      </aside>
    </div>
  </main>
</template>

<style scoped>
  .account-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 17.5rem;
    align-items: start;
    gap: 1.5rem;
  }
  .account-card {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  .account-card-heading {
    display: flex;
    gap: 0.85rem;
    align-items: center;
    padding: 1.5rem 1.75rem;
    border-bottom: 1px solid var(--border);
  }
  .account-card-heading h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .account-card-heading p {
    margin: 0.3rem 0 0;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .account-card form {
    padding: 0.75rem 1.75rem 0;
  }
  .account-current-field {
    margin-bottom: 0.5rem;
  }
  .account-new-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  .account-form-footer {
    margin: 1.5rem -1.75rem 0;
    padding: 1.1rem 1.75rem;
    border-top: 1px solid var(--border);
    background: #fbfcfe;
  }
  .account-form-footer > p {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0 0 0.9rem;
    color: var(--muted);
    font-size: 0.75rem;
  }
  .account-form-footer .app-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  .account-form-footer .actions {
    justify-content: flex-end;
    margin-top: 0;
  }
  .account-feedback,
  .account-card > .success-banner {
    margin: 1.5rem 1.75rem;
  }
  .account-feedback p {
    margin: 0;
  }
  .account-feedback a {
    margin-top: 0.75rem;
  }
  .account-summary {
    margin: 0;
    padding: 1.5rem;
    background: linear-gradient(160deg, #fff, #f4f7fd);
  }
  .account-summary-avatar {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: 48px;
    height: 48px;
    margin-bottom: 1.25rem;
    border-radius: 14px;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .account-role {
    display: block;
    font-size: 0.62rem;
    font-weight: 650;
    letter-spacing: 0.09em;
    color: var(--muted);
  }
  .account-summary h2 {
    font-size: 1.2rem;
    line-height: 1.4;
    margin: 0.55rem 0;
  }
  .account-summary > p {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .account-summary ul {
    display: grid;
    gap: 1rem;
    list-style: none;
    padding: 1.2rem 0;
    margin: 1rem 0;
    border-block: 1px solid var(--border);
  }
  .account-summary li {
    display: flex;
    align-items: start;
    gap: 0.6rem;
    font-size: 0.78rem;
    color: #445570;
  }
  .account-summary li .app-icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    color: var(--accent);
    margin-top: 0.1rem;
  }
  .account-summary .account-summary-note {
    font-size: 0.73rem;
    margin-bottom: 0;
  }
  @media (max-width: 72rem) {
    .account-layout {
      grid-template-columns: 1fr;
    }
    .account-summary {
      display: none;
    }
  }
  @media (max-width: 40rem) {
    .account-new-fields {
      grid-template-columns: 1fr;
      gap: 0;
    }
    .account-card-heading {
      padding: 1.25rem;
    }
    .account-card form {
      padding: 0.5rem 1.25rem 0;
    }
    .account-form-footer {
      margin-inline: -1.25rem;
      padding: 1rem 1.25rem;
    }
    .account-form-footer .actions {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
    }
    .account-form-footer .actions > * {
      justify-content: center;
      flex: 1;
    }
    .account-feedback,
    .account-card > .success-banner {
      margin: 1rem 1.25rem;
    }
  }
  @media (max-width: 24rem) {
    .account-form-footer .actions {
      grid-template-columns: 1fr;
    }
  }
</style>
