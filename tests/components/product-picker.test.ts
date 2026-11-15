import assert from 'node:assert/strict'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import ProductPicker from '../../app/components/ProductPicker.vue'
import type { ProductView } from '../../shared/types/product.ts'

const product: ProductView = {
  id: '9c324b81-4434-4e66-b57a-0eaac04b0806',
  name: 'Pão integral',
  salePriceCents: 1000,
  unitCostCents: 800,
  active: true,
  createdAt: '',
  updatedAt: '',
  grossMarginPercent: 20,
  lowMargin: null,
}
const listing = { items: [product], total: 1, page: 1, pageSize: 20 }
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (originalScroll) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  }
})
function render(selectedId = '', selectedLabel = '') {
  return mount(ProductPicker, {
    attachTo: document.body,
    props: { id: 'picker-test', selectedId, selectedLabel },
  })
}
describe('busca e seleção de produtos', () => {
  it('mantém os resultados ao focar o botão de salvar, sem deslocar o alvo do clique', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(listing))
    const wrapper = render()
    const form = document.createElement('form')
    document.body.append(form)
    form.append(wrapper.element)
    const save = document.createElement('button')
    save.type = 'submit'
    form.append(save)
    await wrapper.get('input').trigger('focus')
    await flushPromises()
    await wrapper.get('.product-picker').trigger('focusout', { relatedTarget: save })
    assert.equal(wrapper.get('input').attributes('aria-expanded'), 'true')
    wrapper.unmount()
    form.remove()
  })
  it('busca no servidor com debounce e escolhe por setas/Enter sem enviar o formulário', async () => {
    const api = vi.fn().mockResolvedValue(listing)
    vi.stubGlobal('$fetch', api)
    const wrapper = render()
    await wrapper.get('input').trigger('focus')
    await flushPromises()
    assert.equal(wrapper.get('input').attributes('role'), 'combobox')
    assert.equal(wrapper.get('input').attributes('aria-expanded'), 'true')
    await wrapper.get('input').setValue('pa')
    await wrapper.get('input').setValue('pao')
    assert.equal(api.mock.calls.length, 1)
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    assert.equal(api.mock.calls.length, 2)
    assert.equal(api.mock.calls[1]?.[1].query.search, 'pao')
    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
    assert.equal(wrapper.get('input').attributes('aria-activedescendant'), 'picker-test-option-0')
    await wrapper.get('input').trigger('keydown', { key: 'Enter' })
    assert.deepEqual(wrapper.emitted('select')?.[0], [product])
    assert.equal(wrapper.get('input').attributes('aria-expanded'), 'false')
    wrapper.unmount()
  })
  it('Escape cancela a busca sem mudar a seleção e sem fechar o modal externo', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(listing))
    const wrapper = render(product.id, 'Pão histórico (venda registrada)')
    await wrapper.get('input').trigger('focus')
    await wrapper.get('input').setValue('Outro')
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    wrapper.get('input').element.dispatchEvent(escape)
    await flushPromises()
    assert.equal(escape.defaultPrevented, true)
    assert.equal(
      wrapper.get<HTMLInputElement>('input').element.value,
      'Pão histórico (venda registrada)',
    )
    assert.equal(wrapper.emitted('select'), undefined)
    assert.deepEqual(wrapper.emitted('pending-change')?.at(-1), [false])
    wrapper.unmount()
  })
  it('ignora respostas antigas mesmo quando o transporte não respeita cancelamento', async () => {
    let resolveOld: (value: typeof listing) => void = () => {
      throw new Error('Requisição não iniciada.')
    }
    const api = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<typeof listing>((resolve) => {
            resolveOld = resolve
          }),
      )
      .mockResolvedValue({ ...listing, items: [{ ...product, name: 'Produto recente' }] })
    vi.stubGlobal('$fetch', api)
    const wrapper = render()
    await wrapper.get('input').trigger('focus')
    await wrapper.get('input').setValue('recente')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    resolveOld(listing)
    await flushPromises()
    assert.match(wrapper.get('[role="listbox"]').text(), /Produto recente/)
    assert.doesNotMatch(wrapper.get('[role="listbox"]').text(), /Pão integral/)
    wrapper.unmount()
  })
  it('preserva o texto de busca sem confirmar seleção ao sair do campo', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(listing))
    const wrapper = render(product.id, product.name)
    await wrapper.get('input').trigger('focus')
    await wrapper.get('input').setValue('Outro nome')
    await wrapper.get('.product-picker').trigger('focusout', { relatedTarget: null })
    assert.equal(wrapper.get<HTMLInputElement>('input').element.value, 'Outro nome')
    assert.equal(wrapper.get('input').attributes('aria-expanded'), 'false')
    assert.deepEqual(wrapper.emitted('pending-change')?.at(-1), [true])
    assert.equal(wrapper.emitted('select'), undefined)
    wrapper.unmount()
  })
  it('exibe erro seguro, permite tentar novamente e informa busca vazia', async () => {
    const api = vi
      .fn()
      .mockRejectedValueOnce(new Error('SQL privado'))
      .mockResolvedValue({ ...listing, items: [], total: 0 })
    vi.stubGlobal('$fetch', api)
    const wrapper = render()
    await wrapper.get('input').trigger('focus')
    await flushPromises()
    assert.match(wrapper.get('[role="alert"]').text(), /Não foi possível buscar/)
    assert.doesNotMatch(wrapper.text(), /SQL privado/)
    await wrapper.get('.picker-message button').trigger('click')
    await flushPromises()
    assert.match(wrapper.text(), /Nenhum produto ativo encontrado/)
    wrapper.unmount()
  })
  it('limpa a seleção explicitamente e busca novamente sem alterar automaticamente o produto', async () => {
    const api = vi.fn().mockResolvedValue(listing)
    vi.stubGlobal('$fetch', api)
    const wrapper = render(product.id, product.name)
    await wrapper.get('input').trigger('focus')
    await flushPromises()
    await wrapper.get('.picker-clear').trigger('click')
    await flushPromises()
    assert.equal(wrapper.emitted('clear')?.length, 1)
    assert.equal(wrapper.emitted('select'), undefined)
    assert.equal(api.mock.calls.at(-1)?.[1].query.search, '')
    await wrapper.setProps({ disabled: true })
    assert.equal(wrapper.get('input').attributes('aria-expanded'), 'false')
    assert.ok(wrapper.get('input').attributes('disabled') !== undefined)
    wrapper.unmount()
  })
})
