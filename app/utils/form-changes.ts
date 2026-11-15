import { watch } from 'vue'

/** Compara o rascunho com os valores de abertura, incluindo campos ainda inválidos. */
export function watchFormChanges(
  form: Readonly<Record<string, string>>,
  onChange: (dirty: boolean) => void,
): void {
  const initialValues = JSON.stringify(form)
  watch(
    () => JSON.stringify(form),
    (values) => onChange(values !== initialValues),
    { immediate: true },
  )
}
