import assert from 'node:assert/strict'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import MyAccount from '../../app/pages/minha-conta.vue'
const currentPassword = 'frase atual sintética para teste 123'
const password = 'nova frase sintética para teste 456'
beforeEach(() => vi.stubGlobal('navigateTo', vi.fn()))
afterEach(() => vi.unstubAllGlobals())
describe('Minha conta', () => {
  it('preserva a nova senha ao corrigir somente a atual e mantém os campos ocultos', async () => {
    const api = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 401 })
      .mockResolvedValueOnce({ authenticated: true })
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(MyAccount)
    await wrapper.get('#account-current-password').setValue('incorreta')
    await wrapper.get('#account-password').setValue(password)
    await wrapper.get('#account-confirmation').setValue(password)
    await wrapper.get('button[aria-controls="account-password"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.match(wrapper.get('#account-current-error').text(), /incorreta/)
    assert.equal(wrapper.get<HTMLInputElement>('#account-current-password').element.value, '')
    assert.equal(wrapper.get<HTMLInputElement>('#account-password').element.value, password)
    assert.equal(wrapper.get<HTMLInputElement>('#account-confirmation').element.value, password)
    assert.equal(wrapper.get('#account-password').attributes('type'), 'password')
    wrapper.unmount()
  })
  it('oferece novo login quando a sessão foi invalidada', async () => {
    vi.stubGlobal(
      '$fetch',
      vi
        .fn()
        .mockRejectedValueOnce({ statusCode: 401 })
        .mockResolvedValueOnce({ authenticated: false }),
    )
    const wrapper = mount(MyAccount)
    await wrapper.get('#account-current-password').setValue(currentPassword)
    await wrapper.get('#account-password').setValue(password)
    await wrapper.get('#account-confirmation').setValue(password)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.match(wrapper.get('[role="alert"]').text(), /sessão expirou/)
    assert.equal(wrapper.find('form').exists(), false)
    assert.equal(wrapper.get('a[href="/entrar"]').text(), 'Entrar novamente')
    wrapper.unmount()
  })

  it('valida senha atual, nova senha e confirmação antes do envio', async () => {
    const api = vi.fn()
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(MyAccount)
    await wrapper.get('form').trigger('submit')
    assert.equal(wrapper.findAll('[role="alert"]').length, 3)
    await wrapper.get('#account-current-password').setValue(currentPassword)
    await wrapper.get('#account-password').setValue(currentPassword)
    await wrapper.get('#account-confirmation').setValue(password)
    await wrapper.get('form').trigger('submit')
    assert.match(wrapper.get('#account-password-error').text(), /diferente/)
    assert.match(wrapper.get('#account-confirmation-error').text(), /mesma nova senha/)
    assert.equal(api.mock.calls.length, 0)
    wrapper.unmount()
  })
  it('permite mostrar senhas, evita envio duplicado e orienta novo login após sucesso', async () => {
    let done: () => void = () => {}
    const api = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          done = resolve
        }),
    )
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(MyAccount)
    await wrapper.get('#account-current-password').setValue(currentPassword)
    await wrapper.get('#account-password').setValue(password)
    await wrapper.get('#account-confirmation').setValue(password)
    await wrapper.get('button[aria-controls="account-password"]').trigger('click')
    assert.equal(wrapper.get('#account-password').attributes('type'), 'text')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    assert.equal(api.mock.calls.length, 1)
    assert.ok(wrapper.get('fieldset').attributes('disabled') !== undefined)
    assert.deepEqual(api.mock.calls[0], [
      '/api/auth/password',
      { method: 'PUT', body: { currentPassword, password, confirmation: password } },
    ])
    done()
    await flushPromises()
    assert.match(wrapper.get('[role="status"]').text(), /Senha alterada/)
    assert.equal(wrapper.find('form').exists(), false)
    assert.ok(
      vi.mocked(navigateTo).mock.calls.some(([path]) => path === '/entrar?status=senha-alterada'),
    )
    assert.equal(wrapper.get('a[href^="/entrar"]').text(), 'Ir para o login')
    wrapper.unmount()
  })
  it('trata falha e limite, limpa e oculta os três campos sem expor erro interno', async () => {
    for (const [statusCode, text] of [
      [429, /quinze minutos/],
      [503, /conexão/],
    ] as const) {
      vi.stubGlobal('$fetch', vi.fn().mockRejectedValue({ statusCode, message: 'SEGREDO SQL' }))
      const wrapper = mount(MyAccount)
      await wrapper.get('#account-current-password').setValue(currentPassword)
      await wrapper.get('#account-password').setValue(password)
      await wrapper.get('#account-confirmation').setValue(password)
      await wrapper.get('button[aria-controls="account-password"]').trigger('click')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      assert.match(wrapper.get('[role="alert"]').text(), text)
      assert.doesNotMatch(wrapper.text(), /SEGREDO/)
      for (const input of wrapper.findAll<HTMLInputElement>('input')) {
        assert.equal(input.element.value, '')
        assert.equal(input.attributes('type'), 'password')
      }
      wrapper.unmount()
    }
  })
})
