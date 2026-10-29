import assert from 'node:assert/strict'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import { reactive } from 'vue'
import Login from '../../app/pages/entrar.vue'
import { requestError } from '../../app/utils/request-error.ts'

const route = reactive<{ query: Record<string, string> }>({ query: {} })
beforeEach(() => {
  route.query = {}
  vi.stubGlobal('useRoute', () => route)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
describe('acesso administrativo', () => {
  it('mostra somente confirmações previstas e não exibe mensagens arbitrárias da URL', () => {
    route.query = { status: 'senha-alterada' }
    const wrapper = mount(Login)
    assert.match(wrapper.get('[role="status"]').text(), /nova senha/)
    wrapper.unmount()
    route.query = { status: '<script>SEGREDO</script>' }
    const unknown = mount(Login)
    assert.equal(unknown.find('[role="status"]').exists(), false)
    assert.doesNotMatch(unknown.text(), /SEGREDO/)
    unknown.unmount()
  })
  it('envia uma senha curta configurada localmente para verificação no servidor', async () => {
    const api = vi.fn().mockResolvedValue({ authenticated: true })
    const navigate = vi.fn()
    vi.stubGlobal('$fetch', api)
    vi.stubGlobal('navigateTo', navigate)
    const wrapper = mount(Login)
    assert.equal(wrapper.get('input').attributes('minlength'), undefined)
    await wrapper.get('input').setValue('local@123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.deepEqual(api.mock.calls[0], [
      '/api/auth/login',
      { method: 'POST', body: { password: 'local@123' } },
    ])
    assert.equal(navigate.mock.calls[0]?.[0], '/')
    assert.equal(wrapper.get<HTMLInputElement>('input').element.value, '')
    wrapper.unmount()
  })
  it('valida senha, permite revelar e oculta o segredo após falha, sem exibir erro interno', async () => {
    const api = vi.fn().mockRejectedValue({ statusCode: 401, message: 'SEGREDO SQL' })
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Login)
    await wrapper.get('form').trigger('submit')
    assert.equal(api.mock.calls.length, 0)
    await wrapper.get('#admin-password').setValue('senha fictícia longa 123')
    await wrapper.get('button[type="button"]').trigger('click')
    assert.equal(wrapper.get('input').attributes('type'), 'text')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    assert.match(wrapper.get('[role="alert"]').text(), /Senha inválida/)
    assert.doesNotMatch(wrapper.text(), /SEGREDO/)
    assert.equal(wrapper.get<HTMLInputElement>('input').element.value, '')
    wrapper.unmount()
  })
  it('impede duplo envio, limpa senha e redireciona para destino fixo após login', async () => {
    let done: () => void = () => {
      throw new Error('Consulta não iniciada.')
    }
    const api = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          done = resolve
        }),
    )
    const navigate = vi.fn()
    vi.stubGlobal('$fetch', api)
    vi.stubGlobal('navigateTo', navigate)
    const wrapper = mount(Login)
    await wrapper.get('input').setValue('senha fictícia longa 123')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    assert.equal(api.mock.calls.length, 1)
    assert.ok(wrapper.get('fieldset').attributes('disabled') !== undefined)
    done()
    await flushPromises()
    assert.equal(navigate.mock.calls[0]?.[0], '/')
    assert.equal(wrapper.get<HTMLInputElement>('input').element.value, '')
    wrapper.unmount()
  })
  it('orienta recuperação de bloqueio/indisponibilidade e sessão expirada sem expor mensagens do servidor', async () => {
    const api = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 429 })
      .mockRejectedValueOnce({ statusCode: 503 })
    vi.stubGlobal('$fetch', api)
    const wrapper = mount(Login)
    for (const text of [/quinze minutos/, /indisponível/]) {
      await wrapper.get('input').setValue('senha fictícia longa 123')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      assert.match(wrapper.get('[role="alert"]').text(), text)
    }
    assert.match(requestError({ statusCode: 401 }, 'falha'), /sessão expirou/)
    assert.equal(requestError(new Error('SEGREDO'), 'falha segura'), 'falha segura')
    wrapper.unmount()
  })
})
