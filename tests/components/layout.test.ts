import assert from 'node:assert/strict'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import Layout from '../../app/layouts/default.vue'

const route = reactive({ path: '/produtos' })
const NuxtLink = defineComponent({
  props: { to: { type: String, required: true } },
  setup:
    (props, { slots }) =>
    () =>
      h('a', { href: props.to }, slots.default?.()),
})
function render() {
  return mount(Layout, {
    global: { stubs: { NuxtLink } },
    slots: { default: '<main id="main-content">Conteúdo da página</main>' },
  })
}
beforeEach(() => {
  route.path = '/produtos'
  vi.stubGlobal('useRoute', () => route)
})
afterEach(() => vi.unstubAllGlobals())

describe('navegação e acesso no layout', () => {
  it('identifica página ativa, preserva textos dos links e acesso direto ao conteúdo', async () => {
    const wrapper = render()
    const navigation = wrapper.get('nav[aria-label="Navegação principal"]')
    assert.equal(navigation.findAll('a').length, 3)
    assert.equal(wrapper.find('aside a[href="/minha-conta"]').exists(), false)
    assert.equal(wrapper.findAll('a[href="/minha-conta"]').length, 1)
    const accountLink = wrapper.get('.topbar a[href="/minha-conta"]')
    assert.equal(accountLink.attributes('aria-label'), 'Acessar Minha conta')
    assert.equal(accountLink.attributes('aria-current'), undefined)
    assert.equal(navigation.get('[aria-current="page"]').attributes('href'), '/produtos')
    assert.equal(wrapper.get('.topbar strong').text(), 'Produtos')
    assert.equal(wrapper.get('.skip-link').attributes('href'), '#main-content')
    route.path = '/sugestoes'
    await nextTick()
    assert.equal(navigation.get('[aria-current="page"]').attributes('href'), '/')
    assert.equal(wrapper.get('.topbar strong').text(), 'Visão geral')
    route.path = '/minha-conta'
    await nextTick()
    assert.equal(navigation.find('[aria-current="page"]').exists(), false)
    assert.equal(accountLink.attributes('aria-current'), 'page')
    assert.equal(wrapper.get('.topbar strong').text(), 'Minha conta')
    assert.equal(wrapper.get('main').text(), 'Conteúdo da página')
    wrapper.unmount()
  })
  it('encerra sessão uma vez, bloqueia repetição e redireciona após confirmação do servidor', async () => {
    let complete: () => void = () => {
      throw new Error('Logout não iniciado.')
    }
    const api = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve
        }),
    )
    const navigate = vi.fn()
    vi.stubGlobal('$fetch', api)
    vi.stubGlobal('navigateTo', navigate)
    const wrapper = render()
    const logout = wrapper.get('button[aria-label="Sair da conta"]')
    await logout.trigger('click')
    await logout.trigger('click')
    assert.equal(api.mock.calls.length, 1)
    assert.ok(logout.attributes('disabled') !== undefined)
    assert.equal(navigate.mock.calls.length, 0)
    complete()
    await flushPromises()
    assert.equal(navigate.mock.calls[0]?.[0], '/entrar')
    wrapper.unmount()
  })
  it('mostra falha segura de logout e usa layout próprio na entrada', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('SEGREDO SQL')))
    const wrapper = render()
    await wrapper.get('button[aria-label="Sair da conta"]').trigger('click')
    await flushPromises()
    assert.match(wrapper.get('[role="alert"]').text(), /Não foi possível encerrar/)
    assert.doesNotMatch(wrapper.text(), /SEGREDO SQL/)
    assert.equal(wrapper.get('button').attributes('disabled'), undefined)
    route.path = '/entrar'
    await nextTick()
    assert.equal(wrapper.find('nav').exists(), false)
    assert.equal(wrapper.get('main').text(), 'Conteúdo da página')
    wrapper.unmount()
  })
})
