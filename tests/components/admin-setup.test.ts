import assert from 'node:assert/strict'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import Setup from '../../app/pages/configurar-conta.vue'
const password = 'frase sintética de configuração 123'
beforeEach(() => vi.stubGlobal('navigateTo', vi.fn()))
afterEach(() => vi.unstubAllGlobals())

describe('configuração da conta administrativa', () => {
  it('valida senha e confirmação sem enviar formulário inválido', async () => {
    const api = vi.fn()
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Setup)
    await wrapper.get('form').trigger('submit')
    assert.equal(wrapper.findAll('[role="alert"]').length, 2)
    await wrapper.get('#setup-password').setValue(password)
    await wrapper.get('#setup-confirmation').setValue('diferente')
    await wrapper.get('form').trigger('submit')
    assert.match(wrapper.get('#setup-confirmation-error').text(), /mesma senha/)
    assert.equal(api.mock.calls.length, 0)
    wrapper.unmount()
  })
  it('permite revelar, impede envio duplicado e limpa segredos após sucesso', async () => {
    let done: () => void = () => {}
    const api = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          done = resolve
        }),
    )
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Setup)
    await wrapper.get('#setup-password').setValue(password)
    await wrapper.get('#setup-confirmation').setValue(password)
    await wrapper.get('button[type="button"]').trigger('click')
    assert.equal(wrapper.get('#setup-password').attributes('type'), 'text')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    assert.equal(api.mock.calls.length, 1)
    assert.ok(wrapper.get('fieldset').attributes('disabled') !== undefined)
    done()
    await flushPromises()
    assert.match(wrapper.get('[role="status"]').text(), /Conta configurada/)
    assert.equal(wrapper.find('form').exists(), false)
    assert.equal(wrapper.get('a.secondary-link[href^="/entrar"]').text(), 'Ir para o login')
    wrapper.unmount()
  })
  it('trata falha segura e limite, oculta e apaga ambas as senhas após tentativa', async () => {
    for (const [statusCode, text] of [
      [503, /conexão/],
      [429, /quinze minutos/],
    ] as const) {
      vi.stubGlobal('$fetch', vi.fn().mockRejectedValue({ statusCode, message: 'SEGREDO SQL' }))
      const wrapper = mount(Setup)
      await wrapper.get('#setup-password').setValue(password)
      await wrapper.get('#setup-confirmation').setValue(password)
      await wrapper.get('button[type="button"]').trigger('click')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      assert.match(wrapper.get('[role="alert"]').text(), text)
      assert.doesNotMatch(wrapper.text(), /SEGREDO/)
      assert.equal(wrapper.get<HTMLInputElement>('#setup-password').element.value, '')
      assert.equal(wrapper.get<HTMLInputElement>('#setup-confirmation').element.value, '')
      assert.equal(wrapper.get('#setup-password').attributes('type'), 'password')
      wrapper.unmount()
    }
  })
  it('encerra a configuração quando outra solicitação já criou a conta', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue({ statusCode: 409 }))
    const wrapper = mount(Setup)
    await wrapper.get('#setup-password').setValue(password)
    await wrapper.get('#setup-confirmation').setValue(password)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.match(wrapper.get('[role="alert"]').text(), /já está configurada/)
    assert.equal(wrapper.find('form').exists(), false)
    assert.equal(wrapper.get('a.secondary-link[href^="/entrar"]').text(), 'Ir para o login')
    wrapper.unmount()
  })
})
