import { nextTick } from 'vue'

/** Posiciona o teclado e a rolagem no primeiro campo que precisa de correção. */
export async function focusFirstInvalid(form: HTMLFormElement | null): Promise<void> {
  await nextTick()
  form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}
