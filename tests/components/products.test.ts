import assert from 'node:assert/strict'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, it, vi } from 'vitest'
import ProductForm from '../../app/components/ProductForm.vue'
import Products from '../../app/pages/produtos.vue'
import type { ProductView } from '../../shared/types/product.ts'

const product: ProductView = {
  id: '9c324b81-4434-4e66-b57a-0eaac04b0806',
  name: 'Pão teste',
  salePriceCents: 1000,
  unitCostCents: 800,
  active: true,
  grossMarginPercent: 20,
  lowMargin: {
    ruleId: 'LOW_MARGIN',
    title: 'Aviso de cadastro',
    severity: 'warning',
    evidence: {
      productName: 'Pão teste',
      unitPriceCents: 1000,
      unitCostCents: 800,
      grossMarginPercent: 20,
      thresholdPercent: 25,
      basis: 'registered-unit-values',
    },
    reason: 'Margem abaixo de 25% experimental.',
    action: 'Revisar preço.',
    limitations: ['Não representa lucro líquido.'],
  },
  createdAt: '',
  updatedAt: '',
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('formulário de produto', () => {
  it('valida campos, preserva valores digitados e converte reais para centavos', async () => {
    const wrapper = mount(ProductForm, { attachTo: document.body })
    await wrapper.get('form').trigger('submit')
    assert.equal(wrapper.emitted('submit'), undefined)
    assert.equal(wrapper.findAll('[role="alert"]').length, 3)
    assert.equal(document.activeElement?.id, 'product-name')
    await wrapper.get('#product-name').setValue(' Pão integral ')
    await wrapper.get('#sale-price').setValue('10,00')
    await wrapper.get('#unit-cost').setValue('8,00')
    await wrapper.get('form').trigger('submit')
    assert.deepEqual(wrapper.emitted('submit')?.[0], [
      { name: 'Pão integral', salePriceCents: 1000, unitCostCents: 800 },
    ])
    wrapper.unmount()
  })
  it('impede duplicação durante gravação e mantém cancelamento explícito na edição', async () => {
    const wrapper = mount(ProductForm, {
      props: { initial: { name: 'Pão', salePriceCents: 500, unitCostCents: 600 }, busy: true },
    })
    assert.ok(wrapper.get('fieldset').attributes('disabled') !== undefined)
    await wrapper.get('form').trigger('submit')
    assert.equal(wrapper.emitted('submit'), undefined)
    await wrapper.setProps({ busy: false })
    await wrapper.get('[data-testid="cancel-edit"]').trigger('click')
    assert.equal(wrapper.emitted('cancel')?.length, 1)
    wrapper.unmount()
  })
})

describe('fluxo de produtos na interface', () => {
  it('carrega lista, edita, recalcula após resposta e confirma desativação', async () => {
    let item: ProductView = { ...product }
    const api = vi.fn(
      async (_url: string, options?: { method?: string; body?: Record<string, unknown> }) => {
        if (options?.method === 'PUT') {
          item = { ...item, salePriceCents: 2000, grossMarginPercent: 60, lowMargin: null }
          return item
        }
        if (options?.method === 'PATCH') {
          item = { ...item, active: false }
          return item
        }
        return { items: [item], total: 1, page: 1, pageSize: 20 }
      },
    )
    vi.stubGlobal('$fetch', api)
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    )
    const wrapper = mount(Products)
    await flushPromises()
    assert.match(wrapper.text(), /Pão teste/)
    assert.match(wrapper.text(), /25% experimental/)
    await wrapper.get('[data-testid="edit-product"]').trigger('click')
    await wrapper.get('#sale-price').setValue('20,00')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.match(wrapper.text(), /Produto atualizado/)
    assert.match(wrapper.text(), /60%/)
    assert.doesNotMatch(wrapper.text(), /25% experimental/)
    await wrapper.get('[data-testid="toggle-product"]').trigger('click')
    await flushPromises()
    assert.match(wrapper.text(), /Inativo/)
    assert.equal(api.mock.calls.filter(([, options]) => options?.method === 'PATCH').length, 1)
    wrapper.unmount()
  })
  it('não altera status ao cancelar a confirmação e mantém feedback de falha', async () => {
    const api = vi.fn().mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 20 })
    vi.stubGlobal('$fetch', api)
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    const wrapper = mount(Products)
    await flushPromises()
    await wrapper.get('[data-testid="toggle-product"]').trigger('click')
    assert.equal(api.mock.calls.length, 1)
    confirm.mockReturnValue(true)
    api.mockRejectedValueOnce(new Error('falha privada'))
    await wrapper.get('[data-testid="toggle-product"]').trigger('click')
    await flushPromises()
    assert.match(wrapper.get('[role="alert"]').text(), /Não foi possível alterar o status/)
    assert.match(wrapper.text(), /Ativo/)
    wrapper.unmount()
  })
  it('mostra estado vazio, cadastra e recupera falha de listagem sem perder formulário', async () => {
    const api = vi
      .fn()
      .mockRejectedValueOnce(new Error('database internals'))
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Products)
    await flushPromises()
    assert.match(wrapper.get('[role="alert"]').text(), /Não foi possível carregar/)
    assert.doesNotMatch(wrapper.text(), /database internals/)
    await wrapper.get('[data-testid="reload-products"]').trigger('click')
    await flushPromises()
    assert.match(wrapper.text(), /Nenhum produto/)
    await wrapper.get('#product-name').setValue('Pão')
    await wrapper.get('#sale-price').setValue('10,00')
    await wrapper.get('#unit-cost').setValue('8,00')
    api.mockRejectedValueOnce(new Error('falha privada'))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.match(wrapper.text(), /Não foi possível salvar/)
    assert.equal(wrapper.get<HTMLInputElement>('#product-name').element.value, 'Pão')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.match(wrapper.text(), /Produto cadastrado/)
    wrapper.unmount()
  })
})
