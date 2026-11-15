import assert from 'node:assert/strict'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import SaleForm from '../../app/components/SaleForm.vue'
import ExpenseForm from '../../app/components/ExpenseForm.vue'
import Records from '../../app/pages/registros.vue'
import type { ProductView } from '../../shared/types/product.ts'
import type { ExpenseView, PeriodSummary, SaleView } from '../../shared/types/operations.ts'
import { formatCents } from '../../shared/utils/money.ts'
import { useDialogMocks } from './dialog-support'

useDialogMocks()

const product: ProductView = {
  id: '9c324b81-4434-4e66-b57a-0eaac04b0806',
  name: 'Pão atual',
  active: true,
  salePriceCents: 2000,
  unitCostCents: 1000,
  createdAt: '',
  updatedAt: '',
  grossMarginPercent: 50,
  lowMargin: null,
}
const sale: SaleView = {
  id: product.id,
  productId: product.id,
  productNameSnapshot: 'Pão histórico',
  date: '2026-10-15',
  quantity: 2,
  unitPriceCents: 1000,
  unitCostCents: 800,
  createdAt: '',
  updatedAt: '',
  revenueCents: 2000,
  costCents: 1600,
  grossMarginPercent: 20,
}
const expense: ExpenseView = {
  id: product.id,
  date: '2026-10-15',
  category: 'Energia',
  description: null,
  amountCents: 650,
  createdAt: '',
  updatedAt: '',
}
const summary: PeriodSummary = {
  revenueCents: 2000,
  costCents: 1600,
  quantity: 2,
  saleCount: 1,
  expenseCents: 650,
  grossMarginPercent: 20,
  expenseRevenuePercent: 32.5,
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function apiMock() {
  return vi.fn(async (path: string, options?: { method?: string; body?: unknown }) => {
    if (options?.method) {
      return { id: product.id }
    }
    if (path.includes('period-summary')) {
      return summary
    }
    if (path.includes('products')) {
      return { items: [product], total: 1, page: 1, pageSize: 20 }
    }
    return { items: path.includes('sales') ? [sale] : [expense], total: 1, page: 1, pageSize: 20 }
  })
}

beforeEach(() => {
  vi.stubGlobal('$fetch', apiMock())
  vi.stubGlobal('useRoute', () => ({ query: {} }))
})

async function selectProduct(wrapper: ReturnType<typeof mount>): Promise<void> {
  await wrapper.get('#sale-product').trigger('focus')
  await flushPromises()
  await wrapper.get(`[data-product-id="${product.id}"]`).trigger('click')
}

describe('formulários de operações', () => {
  it('não salva busca sem seleção e preserva ajustes quando a busca é cancelada', async () => {
    const wrapper = mount(SaleForm, { props: { defaultDate: '2026-10-15' } })
    await selectProduct(wrapper)
    await wrapper.get('#sale-quantity').setValue('7')
    await wrapper.get('#sale-unit-price').setValue('30,00')
    await wrapper.get('#sale-product').setValue('Outro nome ainda não escolhido')
    await wrapper.get('form').trigger('submit')
    assert.equal(wrapper.emitted('submit'), undefined)
    assert.match(wrapper.get('#sale-product-error').text(), /Escolha um produto/)
    await wrapper.get('#sale-product').trigger('keydown', { key: 'Escape' })
    await wrapper.get('form').trigger('submit')
    assert.deepEqual(wrapper.emitted('submit')?.[0], [
      {
        productId: product.id,
        date: '2026-10-15',
        quantity: 7,
        unitPriceCents: 3000,
        unitCostCents: 1000,
      },
    ])
    wrapper.unmount()
  })
  it('preserva os valores históricos ao corrigir venda mesmo com produto alterado', async () => {
    const wrapper = mount(SaleForm, {
      props: { initial: sale, defaultDate: '2026-10-15' },
    })
    assert.match(wrapper.get<HTMLInputElement>('#sale-unit-price').element.value, /^R\$\s10,00$/)
    await selectProduct(wrapper)
    assert.match(wrapper.get<HTMLInputElement>('#sale-unit-price').element.value, /^R\$\s10,00$/)
    await wrapper.get('#sale-quantity').setValue('3')
    await wrapper.get('form').trigger('submit')
    assert.deepEqual(wrapper.emitted('submit')?.[0], [
      {
        productId: product.id,
        date: sale.date,
        quantity: 3,
        unitPriceCents: 1000,
        unitCostCents: 800,
      },
    ])
    wrapper.unmount()
  })
  it('valida venda e captura valores ao escolher um produto; mantém escolha entre páginas', async () => {
    const wrapper = mount(SaleForm, {
      attachTo: document.body,
      props: { defaultDate: '2026-10-15' },
    })
    await wrapper.get('form').trigger('submit')
    assert.ok(wrapper.findAll('[role="alert"]').length >= 3)
    assert.equal(document.activeElement?.id, 'sale-product')
    await selectProduct(wrapper)

    assert.equal(wrapper.get<HTMLInputElement>('#sale-product').element.value, product.name)
    assert.equal(wrapper.get('#sale-quantity').attributes('maxlength'), undefined)
    for (const invalid of ['1.5', '1e3', '0', '10000000', '1000001', '1.000']) {
      await wrapper.get('#sale-quantity').setValue(invalid)
      await wrapper.get('form').trigger('submit')
      assert.equal(wrapper.emitted('submit'), undefined)
    }
    await wrapper.get('#sale-quantity').setValue('1')
    await wrapper.get('form').trigger('submit')
    assert.deepEqual(wrapper.emitted('submit')?.[0], [
      {
        productId: product.id,
        date: sale.date,
        quantity: 1,
        unitPriceCents: 2000,
        unitCostCents: 1000,
      },
    ])
    wrapper.unmount()
  })
  it('valida e normaliza despesa e impede gravação duplicada enquanto ocupada', async () => {
    const wrapper = mount(ExpenseForm, {
      attachTo: document.body,
      props: { defaultDate: '2026-10-15' },
    })
    await wrapper.get('form').trigger('submit')
    assert.equal(wrapper.emitted('submit'), undefined)
    assert.equal(document.activeElement?.id, 'expense-category')
    await wrapper.get('#expense-category').setValue(' Energia ')
    await wrapper.get('#expense-amount').setValue('6,50')
    await wrapper.get('#expense-description').setValue(' Conta sintética ')
    await wrapper.get('form').trigger('submit')
    assert.deepEqual(wrapper.emitted('submit')?.[0], [
      { date: '2026-10-15', category: 'Energia', description: 'Conta sintética', amountCents: 650 },
    ])
    await wrapper.setProps({ busy: true })
    await wrapper.get('form').trigger('submit')
    assert.equal(wrapper.emitted('submit')?.length, 1)
    wrapper.unmount()
    assert.equal(formatCents(Number.MAX_SAFE_INTEGER), 'R$\u00a090.071.992.547.409,91')
  })
})

describe('interface de registros do período', () => {
  it('mantém o produto escolhido e o rascunho ao paginar as opções no modal de venda', async () => {
    const otherProduct: ProductView = {
      ...product,
      id: '9c324b81-4434-4e66-b57a-0eaac04b0807',
      name: 'Outro produto',
    }
    const api = vi.fn(async (path: string, options?: { query?: { page?: number } }) => {
      if (path.includes('period-summary')) {
        return summary
      }
      if (path.includes('products')) {
        return {
          items: options?.query?.page === 2 ? [otherProduct] : [product],
          total: 21,
          page: options?.query?.page ?? 1,
          pageSize: 20,
        }
      }
      return { items: path.includes('sales') ? [sale] : [expense], total: 1, page: 1, pageSize: 20 }
    })
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Records)
    await flushPromises()
    assert.match(wrapper.get('a.secondary-link').attributes('href') ?? '', /^\/sugestoes\?to=/)
    await wrapper.get('#new-sale').trigger('click')
    await selectProduct(wrapper)
    await wrapper.get('#sale-quantity').setValue('7')
    await wrapper.get('#sale-product').trigger('focus')
    await flushPromises()
    await wrapper.get('[aria-label="Produtos encontrados: próxima"]').trigger('click')
    await flushPromises()
    assert.equal(wrapper.get<HTMLInputElement>('#sale-product').element.value, product.name)
    assert.equal(wrapper.get<HTMLInputElement>('#sale-quantity').element.value, '7')
    assert.match(wrapper.get<HTMLInputElement>('#sale-unit-price').element.value, /20,00/)
    assert.match(wrapper.get('.picker-footer').text(), /Página 2 de 2/)
    wrapper.unmount()
  })
  it('abre somente o formulário escolhido e permite cancelar remoção sem excluir dados', async () => {
    const api = apiMock()
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Records)
    await flushPromises()
    assert.equal(wrapper.find('#sale-product').exists(), false)
    assert.equal(wrapper.find('#expense-category').exists(), false)
    await wrapper.get('#new-sale').trigger('click')
    assert.equal(wrapper.find('#sale-product').exists(), true)
    assert.equal(wrapper.find('#expense-category').exists(), false)
    await wrapper.get('dialog').trigger('cancel')
    assert.equal(wrapper.find('dialog').exists(), false)
    await wrapper.get('[aria-label="Remover despesa de Energia"]').trigger('click')
    assert.match(wrapper.get('dialog').text(), /Energia/)
    assert.match(wrapper.get('dialog').text(), /6,50/)
    await wrapper.get('.confirmation-cancel').trigger('click')
    assert.equal(api.mock.calls.filter(([, options]) => options?.method === 'DELETE').length, 0)
    assert.equal(wrapper.find('dialog').exists(), false)
    wrapper.unmount()
  })
  it('cria operações pelos modais e mantém erros da API junto aos campos preservados', async () => {
    const api = apiMock()
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Records)
    await flushPromises()
    await wrapper.get('#new-sale').trigger('click')
    await selectProduct(wrapper)
    await wrapper.get('section[aria-label="Formulário de venda"] form').trigger('submit')
    await flushPromises()
    assert.equal(wrapper.find('dialog').exists(), false)
    assert.ok(
      api.mock.calls.some(([path, options]) => path === '/api/sales' && options?.method === 'POST'),
    )
    await wrapper.get('#new-expense').trigger('click')
    await wrapper.get('#expense-category').setValue('Energia')
    await wrapper.get('#expense-amount').setValue('6,50')
    api.mockRejectedValueOnce({ statusCode: 503, message: 'segredo privado' })
    await wrapper.get('section[aria-label="Formulário de despesa"] form').trigger('submit')
    await flushPromises()
    assert.match(wrapper.get('dialog [role="alert"]').text(), /Não foi possível salvar/)
    assert.equal(wrapper.find('dialog a').exists(), false)
    assert.equal(wrapper.get<HTMLInputElement>('#expense-category').element.value, 'Energia')
    assert.doesNotMatch(wrapper.text(), /segredo privado/)
    await wrapper.get('section[aria-label="Formulário de despesa"] form').trigger('submit')
    await flushPromises()
    assert.equal(wrapper.find('dialog').exists(), false)
    assert.ok(
      api.mock.calls.some(
        ([path, options]) => path === '/api/expenses' && options?.method === 'POST',
      ),
    )
    wrapper.unmount()
  })
  it('reconsulta indicadores depois de corrigir venda e despesa e remover despesa', async () => {
    const api = apiMock()
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Records)
    await flushPromises()
    assert.match(wrapper.get('[data-testid="revenue"]').text(), /20,00/)
    await wrapper.get('[aria-label="Corrigir venda de Pão histórico"]').trigger('click')
    await wrapper.get('#sale-quantity').setValue('3')
    await wrapper.get('section[aria-label="Formulário de venda"] form').trigger('submit')
    await flushPromises()
    assert.ok(
      api.mock.calls.some(
        ([path, options]) => path.includes('/sales/') && options?.method === 'PUT',
      ),
    )
    await wrapper.get('[aria-label="Corrigir despesa de Energia"]').trigger('click')
    await wrapper.get('#expense-amount').setValue('10,00')
    await wrapper.get('section[aria-label="Formulário de despesa"] form').trigger('submit')
    await flushPromises()
    await wrapper.get('[aria-label="Remover despesa de Energia"]').trigger('click')
    await wrapper
      .get('#expense-delete-modal .confirmation-actions button:last-child')
      .trigger('click')
    await flushPromises()
    assert.match(wrapper.text(), /Despesa removida/)
    assert.equal(
      api.mock.calls.filter(
        ([path, options]) => path.includes('period-summary') && !options?.method,
      ).length,
      4,
    )
    wrapper.unmount()
  })
  it('mantém formulário em falha de gravação, permite recarga e valida período', async () => {
    const api = apiMock()
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Records)
    await flushPromises()
    await wrapper.get('#new-expense').trigger('click')
    await wrapper.get('#expense-category').setValue('Aluguel')
    await wrapper.get('#expense-amount').setValue('10,00')
    api.mockRejectedValueOnce(new Error('senha privada'))
    await wrapper.get('section[aria-label="Formulário de despesa"] form').trigger('submit')
    await flushPromises()
    assert.match(wrapper.get('[role="alert"]').text(), /dados digitados foram mantidos/)
    assert.equal(wrapper.get<HTMLInputElement>('#expense-category').element.value, 'Aluguel')
    await wrapper.get('#record-modal .modal-close').trigger('click')
    await wrapper.get('.discard-confirmation button:last-child').trigger('click')
    await wrapper.get('#period-from').setValue('2026-11-01')
    await wrapper.get('#period-to').setValue('2026-10-01')
    await wrapper.get('form[aria-label="Período dos registros"]').trigger('submit')
    assert.match(wrapper.get('[role="alert"]').text(), /datas válidas/)
    wrapper.unmount()
  })
})

describe('conferência dos registros da análise', () => {
  it('filtra a semana anterior e mantém o retorno à análise de origem após uma correção', async () => {
    vi.stubGlobal('useRoute', () => ({
      query: { from: '2026-10-01', to: '2026-10-07', analysisTo: '2026-10-14' },
      hash: '#sales-title',
    }))
    const api = apiMock()
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Records, { attachTo: document.body })
    await flushPromises()
    const periodRequest = api.mock.calls.find(([path]) => path.includes('period-summary'))
    assert.ok(periodRequest)
    assert.deepEqual(periodRequest[1], { query: { from: '2026-10-01', to: '2026-10-07' } })
    assert.equal(wrapper.get<HTMLInputElement>('#period-from').element.value, '2026-10-01')
    assert.equal(wrapper.get<HTMLInputElement>('#period-to').element.value, '2026-10-07')
    assert.match(wrapper.get('.analysis-return').text(), /2026-10-14/)
    assert.equal(document.activeElement?.id, 'sales-title')
    const link = wrapper.get('a.secondary-link')
    assert.equal(link.text(), 'Voltar à análise')
    assert.equal(link.attributes('href'), '/sugestoes?to=2026-10-14')
    await wrapper.get('#new-expense').trigger('click')
    await wrapper.get('#expense-category').setValue('DEMO · Energia fictícia')
    await wrapper.get('#expense-amount').setValue('300,00')
    await wrapper.get('section[aria-label="Formulário de despesa"] form').trigger('submit')
    await flushPromises()
    assert.equal(wrapper.find('dialog').exists(), false)
    assert.equal(link.attributes('href'), '/sugestoes?to=2026-10-14')
    wrapper.unmount()
  })
  it('não consulta nem usa parâmetros de período inválidos ou duplicados', async () => {
    vi.stubGlobal('useRoute', () => ({
      query: { from: ['2026-10-01'], to: '2026-10-07', analysisTo: '//evil.example' },
    }))
    const api = apiMock()
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Records)
    await flushPromises()
    assert.equal(api.mock.calls.length, 0)
    assert.match(wrapper.get('[role="alert"]').text(), /período inválido/)
    assert.equal(wrapper.find('.analysis-return').exists(), false)
    assert.equal(wrapper.get('a.secondary-link').attributes('href'), '/sugestoes')
    wrapper.unmount()
  })
})
