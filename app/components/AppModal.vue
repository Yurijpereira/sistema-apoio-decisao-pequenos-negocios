<script setup lang="ts">
  import { nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
  import AppIcon from './AppIcon.vue'

  const props = withDefaults(
    defineProps<{
      id: string
      title: string
      description?: string
      initialFocus?: string
      fallbackFocus?: string
      busy?: boolean
      dirty?: boolean
      error?: string
      role?: 'dialog' | 'alertdialog'
    }>(),
    {
      role: 'dialog',
      fallbackFocus: '#main-content',
      description: '',
      initialFocus: '',
      error: '',
    },
  )
  const emit = defineEmits<{ close: [] }>()
  const dialog = ref<HTMLDialogElement | null>(null)
  const heading = ref<HTMLElement | null>(null)
  const errorMessage = ref<HTMLElement | null>(null)
  const continueButton = ref<HTMLButtonElement | null>(null)
  const confirmingDiscard = ref(false)
  let opener: HTMLElement | null = null
  let previousField: HTMLElement | null = null
  let previousOverflow = ''
  let pointerStartedOutside = false

  async function keepEditing(): Promise<void> {
    confirmingDiscard.value = false
    await nextTick()
    if (previousField?.isConnected) {
      previousField.focus()
    } else {
      focusInitialElement()
    }
  }
  async function requestClose(): Promise<void> {
    if (props.busy) {
      return
    }
    if (confirmingDiscard.value) {
      await keepEditing()
    } else if (props.dirty) {
      confirmingDiscard.value = true
      await nextTick()
      continueButton.value?.focus()
    } else {
      emit('close')
    }
  }
  function discard(): void {
    if (!props.busy) {
      emit('close')
    }
  }
  function focusInitialElement(): void {
    const target = props.initialFocus
      ? dialog.value?.querySelector<HTMLElement>(props.initialFocus)
      : null
    const element = target ?? heading.value
    element?.focus()
  }
  function outsideDialog(event: MouseEvent): boolean {
    const bounds = dialog.value?.getBoundingClientRect()
    return Boolean(
      bounds &&
      event.target === dialog.value &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom),
    )
  }
  function backdropClick(event: MouseEvent): void {
    if (pointerStartedOutside && outsideDialog(event)) {
      void requestClose()
    }
    pointerStartedOutside = false
  }
  function protectDraft(event: BeforeUnloadEvent): void {
    if (props.dirty || props.busy) {
      event.preventDefault()
    }
  }
  function rememberField(event: FocusEvent): void {
    if (event.target instanceof HTMLElement && event.target.matches('input, select, textarea')) {
      previousField = event.target
    }
  }
  function cycleFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') {
      return
    }
    const controls = Array.from(
      dialog.value?.querySelectorAll<HTMLElement>(
        'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]',
      ) ?? [],
    ).filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(':disabled') &&
        element.getClientRects().length > 0,
    )
    const first = controls[0]
    const last = controls.at(-1)
    const active = document.activeElement
    const activeControl = active instanceof HTMLElement && controls.includes(active)
    if (!first || !last) {
      event.preventDefault()
      heading.value?.focus()
    } else if (event.shiftKey && (active === first || !activeControl)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }
  watch(
    () => props.error,
    async (message) => {
      if (message) {
        await nextTick()
        errorMessage.value?.focus()
      }
    },
  )
  onMounted(() => {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.value?.showModal()
    focusInitialElement()
    window.addEventListener('beforeunload', protectDraft)
  })
  onBeforeUnmount(() => {
    dialog.value?.close()
    document.body.style.overflow = previousOverflow
    window.removeEventListener('beforeunload', protectDraft)
  })
  onUnmounted(async () => {
    await nextTick()
    const target = opener?.isConnected
      ? opener
      : document.querySelector<HTMLElement>(props.fallbackFocus)
    target?.focus()
  })
  defineExpose({ requestClose })
</script>

<template>
  <dialog
    :id="id"
    ref="dialog"
    class="app-modal"
    :role="confirmingDiscard ? 'alertdialog' : role"
    aria-modal="true"
    :aria-labelledby="`${id}-title`"
    :aria-describedby="description || confirmingDiscard ? `${id}-description` : undefined"
    :aria-busy="busy"
    @cancel.prevent="requestClose"
    @keydown="cycleFocus"
    @pointerdown="pointerStartedOutside = outsideDialog($event)"
    @pointercancel="pointerStartedOutside = false"
    @click="backdropClick"
  >
    <header class="modal-header">
      <div>
        <p class="section-kicker">
          {{ confirmingDiscard ? 'ALTERAÇÕES NÃO SALVAS' : 'VISÃOATIVA' }}
        </p>
        <h2
          :id="`${id}-title`"
          ref="heading"
          tabindex="-1"
        >
          {{ confirmingDiscard ? 'Descartar alterações?' : title }}
        </h2>
        <p
          v-if="description || confirmingDiscard"
          :id="`${id}-description`"
          class="modal-description"
        >
          {{
            confirmingDiscard
              ? 'Você tem informações não salvas. Deseja continuar editando ou descartá-las?'
              : description
          }}
        </p>
      </div>
      <button
        type="button"
        class="secondary modal-close"
        :aria-label="confirmingDiscard ? 'Voltar ao formulário' : `Fechar ${title}`"
        :disabled="busy"
        @click="requestClose"
      >
        <AppIcon name="close" />
      </button>
    </header>
    <div class="modal-body">
      <div
        v-if="confirmingDiscard"
        class="discard-confirmation"
      >
        <div class="actions">
          <button
            ref="continueButton"
            type="button"
            @click="keepEditing"
          >
            Continuar editando
          </button>
          <button
            type="button"
            class="secondary danger"
            :disabled="busy"
            @click="discard"
          >
            Descartar alterações
          </button>
        </div>
      </div>
      <div
        v-show="!confirmingDiscard"
        @focusin="rememberField"
      >
        <div
          v-if="error"
          ref="errorMessage"
          class="error-banner"
          role="alert"
          tabindex="-1"
        >
          {{ error }}
        </div>
        <slot />
      </div>
    </div>
  </dialog>
</template>
