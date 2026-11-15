import { afterEach, beforeEach, vi } from 'vitest'

/** JSDOM não implementa a API nativa; foco modal e inert são verificados no navegador. */
export function useDialogMocks(): void {
  const prototype = HTMLDialogElement.prototype
  const originalShow = Object.getOwnPropertyDescriptor(prototype, 'showModal')
  const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close')
  beforeEach(() => {
    Object.defineProperty(prototype, 'showModal', {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = true
      }),
    })
    Object.defineProperty(prototype, 'close', {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = false
      }),
    })
  })
  afterEach(() => {
    for (const [name, descriptor] of [
      ['showModal', originalShow],
      ['close', originalClose],
    ] as const) {
      if (descriptor) {
        Object.defineProperty(prototype, name, descriptor)
      } else {
        Reflect.deleteProperty(prototype, name)
      }
    }
  })
}
