import assert from 'node:assert/strict'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import Layout from '../../app/layouts/default.vue'

const route = reactive({ path: '/' })
const NuxtLink = defineComponent({
  props: { to: { type: String, required: true } },
  setup:
    (props, { slots }) =>
    () =>
      h('a', { href: props.to }, slots.default?.()),
})
beforeEach(() => {
  route.path = '/'
  vi.stubGlobal('useRoute', () => route)
})
afterEach(() => vi.unstubAllGlobals())

describe('navegação sem conta', () => {
  it('oferece início e todas as funções, com uma página ativa e acesso direto ao conteúdo', async () => {
    const api = vi.fn()
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Layout, {
      global: { stubs: { NuxtLink } },
      slots: { default: '<main id="main-content">Conteúdo da página</main>' },
    })
    const navigation = wrapper.get('nav[aria-label="Navegação principal"]')
    assert.equal(navigation.findAll('a').length, 4)
    for (const [path, label] of [
      ['/', 'Início'],
      ['/sugestoes', 'Visão geral'],
      ['/produtos', 'Produtos'],
      ['/registros', 'Vendas e despesas'],
    ]) {
      route.path = path ?? '/'
      await nextTick()
      assert.equal(navigation.findAll('[aria-current="page"]').length, 1)
      assert.equal(navigation.get('[aria-current="page"]').attributes('href'), path)
      assert.equal(wrapper.get('.topbar strong').text(), label)
    }
    assert.equal(wrapper.get('.skip-link').attributes('href'), '#main-content')
    assert.equal(wrapper.get('main').text(), 'Conteúdo da página')
    assert.match(wrapper.get('.sidebar-note').text(), /Uso local/)
    assert.equal(wrapper.find('a[href="/minha-conta"]').exists(), false)
    assert.equal(wrapper.find('a[href="/entrar"]').exists(), false)
    assert.equal(wrapper.find('button').exists(), false)
    assert.equal(api.mock.calls.length, 0)
    wrapper.unmount()
  })
})
