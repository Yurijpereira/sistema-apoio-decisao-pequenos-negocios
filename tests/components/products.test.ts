import assert from 'node:assert/strict'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import ProductForm from '../../app/components/ProductForm.vue'
import Products from '../../app/pages/produtos.vue'
import type { ProductView } from '../../shared/types/product.ts'
import { useDialogMocks } from './dialog-support'

useDialogMocks()

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
beforeEach(() => {
  vi.stubGlobal('useRoute', () => ({ query: {} }))
})
afterEach(() => {
  vi.useRealTimers()
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
  it('retorna à mesma análise após editar o cadastro sem enviar contexto à API', async () => {
    vi.stubGlobal('useRoute', () => ({
      query: { analysisTo: '2026-10-14', recordsComplete: 'true' },
    }))
    const api = vi.fn().mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 20 })
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Products)
    await flushPromises()
    const link = wrapper.get('a.secondary-link')
    assert.equal(link.text(), 'Voltar à análise')
    assert.equal(link.attributes('href'), '/sugestoes?to=2026-10-14')
    await wrapper.get('button[aria-label="Editar Pão teste"]').trigger('click')
    await wrapper.get('#sale-price').setValue('12,00')
    await wrapper.get('#product-modal form').trigger('submit')
    await flushPromises()
    assert.equal(link.attributes('href'), '/sugestoes?to=2026-10-14')
    assert.deepEqual(api.mock.calls[1], [
      `/api/products/${product.id}`,
      { method: 'PUT', body: { name: 'Pão teste', salePriceCents: 1200, unitCostCents: 800 } },
    ])
    assert.deepEqual(api.mock.calls.at(-1)?.[1].query, { page: 1, status: 'all', search: '' })
    wrapper.unmount()
  })
  it('ignora contexto inválido ou duplicado e mantém o acesso normal às sugestões', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    )
    for (const analysisTo of [
      undefined,
      ['2026-10-14', '2026-10-15'],
      '//evil.example',
      '2026-02-30',
      '0001-01-13',
    ]) {
      vi.stubGlobal('useRoute', () => ({ query: { analysisTo } }))
      const wrapper = mount(Products)
      await flushPromises()
      const link = wrapper.get('a.secondary-link')
      assert.equal(link.text(), 'Ver sugestões')
      assert.equal(link.attributes('href'), '/sugestoes')
      wrapper.unmount()
    }
  })
  it('busca no catálogo, combina status, reinicia paginação e permite limpar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const api = vi.fn(
      async (
        _path: string,
        options?: { query?: { page?: number; status?: string; search?: string } },
      ) => ({ items: [product], total: 24, page: options?.query?.page ?? 1, pageSize: 20 }),
    )
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Products)
    await flushPromises()
    assert.equal(wrapper.get('a.secondary-link').attributes('href'), '/sugestoes')
    await wrapper.get('nav[aria-label="Páginas de produtos"] button:last-child').trigger('click')
    await flushPromises()
    assert.equal(api.mock.calls.at(-1)?.[1]?.query?.page, 2)
    await wrapper.get('#product-search').setValue('pao')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    assert.deepEqual(api.mock.calls.at(-1)?.[1]?.query, { page: 1, status: 'all', search: 'pao' })
    await wrapper.get('#product-status').setValue('inactive')
    await flushPromises()
    assert.deepEqual(api.mock.calls.at(-1)?.[1]?.query, {
      page: 1,
      status: 'inactive',
      search: 'pao',
    })
    await wrapper.get('form[role="search"] button:last-child').trigger('click')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    assert.equal(api.mock.calls.at(-1)?.[1]?.query?.search, '')
    assert.equal(wrapper.get<HTMLInputElement>('#product-search').element.value, '')
    wrapper.unmount()
  })
  it('respostas antigas não substituem a busca mais recente', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let finishOld: (value: unknown) => void = () => {
      throw new Error('Busca não iniciada.')
    }
    const api = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve
          }),
      )
      .mockResolvedValue({
        items: [{ ...product, name: 'Resultado recente' }],
        total: 1,
        page: 1,
        pageSize: 20,
      })
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Products)
    await wrapper.get('#product-search').setValue('recente')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    finishOld({ items: [product], total: 1, page: 1, pageSize: 20 })
    await flushPromises()
    assert.match(wrapper.get('.product-list').text(), /Resultado recente/)
    assert.doesNotMatch(wrapper.get('.product-list').text(), /Pão teste/)
    wrapper.unmount()
  })
  it('abre cadastro sob demanda e protege alterações até o descarte explícito', async () => {
    const api = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Products)
    await flushPromises()
    assert.equal(wrapper.find('#product-name').exists(), false)
    await wrapper.get('#new-product').trigger('click')
    await wrapper.get('#product-name').setValue('Rascunho de pão')
    await wrapper.get('.modal-close').trigger('click')
    assert.match(wrapper.get('#product-modal-title').text(), /Descartar alterações/)
    await wrapper.get('.discard-confirmation button:first-child').trigger('click')
    assert.equal(wrapper.get<HTMLInputElement>('#product-name').element.value, 'Rascunho de pão')
    await wrapper.get('.modal-close').trigger('click')
    await wrapper.get('.discard-confirmation button:last-child').trigger('click')
    assert.equal(wrapper.find('dialog').exists(), false)
    assert.equal(api.mock.calls.length, 1)
    await wrapper.get('#new-product').trigger('click')
    assert.equal(wrapper.get<HTMLInputElement>('#product-name').element.value, '')
    wrapper.unmount()
  })
  it('não repete gravação quando o produto foi salvo mas a recarga da lista falhou', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20 })
      .mockResolvedValueOnce(product)
      .mockRejectedValueOnce(new Error('detalhes SQL privados'))
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Products)
    await flushPromises()
    await wrapper.get('#new-product').trigger('click')
    await wrapper.get('#product-name').setValue('Pão')
    await wrapper.get('#sale-price').setValue('10,00')
    await wrapper.get('#unit-cost').setValue('8,00')
    await wrapper.get('#product-modal form').trigger('submit')
    await flushPromises()
    assert.equal(wrapper.find('dialog').exists(), false)
    assert.match(wrapper.get('[role="status"]').text(), /Produto cadastrado/)
    assert.match(wrapper.get('[role="alert"]').text(), /Não foi possível carregar/)
    assert.doesNotMatch(wrapper.text(), /detalhes SQL privados/)
    wrapper.unmount()
  })
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
    const wrapper = mount(Products)
    await flushPromises()
    assert.match(wrapper.text(), /Pão teste/)
    assert.match(wrapper.text(), /25% experimental/)
    await wrapper.get('[data-testid="edit-product"]').trigger('click')
    await wrapper.get('#sale-price').setValue('20,00')
    await wrapper.get('#product-modal form').trigger('submit')
    await flushPromises()
    assert.match(wrapper.text(), /Produto atualizado/)
    assert.match(wrapper.text(), /60%/)
    assert.doesNotMatch(wrapper.text(), /25% experimental/)
    await wrapper.get('[data-testid="toggle-product"]').trigger('click')
    assert.equal(api.mock.calls.filter(([, options]) => options?.method === 'PATCH').length, 0)
    await wrapper
      .get('#product-status-modal .confirmation-actions button:last-child')
      .trigger('click')
    await flushPromises()
    assert.match(wrapper.text(), /Inativo/)
    assert.equal(api.mock.calls.filter(([, options]) => options?.method === 'PATCH').length, 1)
    wrapper.unmount()
  })
  it('não altera status ao cancelar a confirmação e mantém feedback de falha', async () => {
    const api = vi.fn().mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 20 })
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Products)
    await flushPromises()
    await wrapper.get('[data-testid="toggle-product"]').trigger('click')
    await wrapper.get('#product-status-modal .confirmation-cancel').trigger('click')
    assert.equal(api.mock.calls.length, 1)
    api.mockRejectedValueOnce(new Error('falha privada'))
    await wrapper.get('[data-testid="toggle-product"]').trigger('click')
    await wrapper
      .get('#product-status-modal .confirmation-actions button:last-child')
      .trigger('click')
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
    await wrapper.get('#new-product').trigger('click')
    await wrapper.get('#product-name').setValue('Pão')
    await wrapper.get('#sale-price').setValue('10,00')
    await wrapper.get('#unit-cost').setValue('8,00')
    api.mockRejectedValueOnce(new Error('falha privada'))
    await wrapper.get('#product-modal form').trigger('submit')
    await flushPromises()
    assert.match(wrapper.text(), /Não foi possível salvar/)
    assert.equal(wrapper.get<HTMLInputElement>('#product-name').element.value, 'Pão')
    await wrapper.get('#product-modal form').trigger('submit')
    await flushPromises()
    assert.match(wrapper.text(), /Produto cadastrado/)
    wrapper.unmount()
  })
})
