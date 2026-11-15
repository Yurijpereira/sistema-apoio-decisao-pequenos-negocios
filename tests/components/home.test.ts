import assert from 'node:assert/strict'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, it, vi } from 'vitest'
import Home from '../../app/pages/index.vue'

const NuxtLink = defineComponent({
  props: { to: { type: String, required: true } },
  setup:
    (props, { slots }) =>
    () =>
      h('a', { href: props.to }, slots.default?.()),
})
afterEach(() => vi.unstubAllGlobals())

describe('início com apresentação e orientação', () => {
  it('apresenta o sistema sem depender da API, explica limites e oferece os três primeiros passos', () => {
    const api = vi.fn()
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Home, { global: { stubs: { NuxtLink } } })
    assert.equal(api.mock.calls.length, 0)
    assert.equal(wrapper.findAll('h1').length, 1)
    assert.match(wrapper.get('h1').text(), /clareza para decidir/)
    assert.equal(wrapper.get('main').attributes('id'), 'main-content')
    const steps = wrapper.findAll('ol li')
    assert.equal(steps.length, 3)
    assert.deepEqual(
      steps.map((step) => step.get('a').attributes('href')),
      ['/produtos', '/registros', '/sugestoes'],
    )
    assert.equal(wrapper.get('.primary-link').attributes('href'), '/sugestoes')
    assert.equal(wrapper.get('.secondary-link').attributes('href'), '#primeiros-passos')
    assert.ok(wrapper.find('#primeiros-passos').exists())
    assert.match(wrapper.get('[aria-labelledby="home-about-title"]').text(), /Sobre o sistema/)
    assert.match(wrapper.text(), /margem bruta estimada/)
    assert.match(wrapper.text(), /não representa o lucro líquido/)
    assert.match(wrapper.text(), /sem login/)
    assert.match(wrapper.text(), /consultar e alterar os registros/)
    assert.equal(wrapper.find('form').exists(), false)
    wrapper.unmount()
  })
})
