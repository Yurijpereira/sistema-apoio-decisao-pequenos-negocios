import assert from 'node:assert/strict'
import { mount } from '@vue/test-utils'
import { describe, it } from 'vitest'
import PasswordInput from '../../app/components/PasswordInput.vue'
import PasswordRequirements from '../../app/components/PasswordRequirements.vue'

describe('campos de senha consistentes', () => {
  it('mantém a revelação por campo, acessibilidade e oculta quando o valor é limpo', async () => {
    const wrapper = mount(PasswordInput, {
      props: { id: 'password', label: 'nova senha', modelValue: 'frase de exemplo' },
      attrs: { autocomplete: 'new-password', 'aria-describedby': 'help' },
    })
    assert.equal(wrapper.get('input').attributes('autocomplete'), 'new-password')
    assert.equal(wrapper.get('input').attributes('aria-describedby'), 'help')
    assert.equal(wrapper.get('button').attributes('aria-controls'), 'password')
    await wrapper.get('button').trigger('click')
    assert.equal(wrapper.get('input').attributes('type'), 'text')
    assert.equal(wrapper.get('button').attributes('aria-label'), 'Ocultar nova senha')
    await wrapper.setProps({ modelValue: '' })
    assert.equal(wrapper.get('input').attributes('type'), 'password')
    wrapper.unmount()
  })
  it('não corta senhas longas e permite ocultar sem apagar a nova senha após uma tentativa', async () => {
    const wrapper = mount(PasswordInput, {
      props: { id: 'password', label: 'nova senha', modelValue: '', resetKey: 0 },
    })
    assert.equal(wrapper.get('input').attributes('maxlength'), undefined)
    await wrapper.get('input').setValue('a'.repeat(129))
    assert.equal(wrapper.emitted('update:modelValue')?.at(-1)?.[0], 'a'.repeat(129))
    await wrapper.get('button').trigger('click')
    await wrapper.setProps({ modelValue: 'a'.repeat(129), resetKey: 1, invalid: true })
    assert.equal(wrapper.get('input').attributes('type'), 'password')
    assert.equal(wrapper.get('input').attributes('aria-invalid'), 'true')
    assert.equal(wrapper.get<HTMLInputElement>('input').element.value.length, 129)
    await wrapper.setProps({ disabled: true })
    assert.equal(wrapper.get('button').attributes('disabled'), '')
    wrapper.unmount()
  })
  it('apresenta requisitos verificáveis sem classificar artificialmente a força da senha', async () => {
    const wrapper = mount(PasswordRequirements, {
      props: { password: '', confirmation: '', currentPassword: 'anterior' },
    })
    assert.equal(wrapper.findAll('.fulfilled').length, 0)
    await wrapper.setProps({
      password: 'uma frase nova e longa',
      confirmation: 'uma frase nova e longa',
    })
    assert.equal(wrapper.findAll('.fulfilled').length, 3)
    await wrapper.setProps({ currentPassword: '' })
    assert.equal(wrapper.findAll('.fulfilled').length, 2)
    await wrapper.setProps({ currentPassword: 'uma frase nova e longa' })
    assert.equal(wrapper.findAll('.fulfilled').length, 2)
    wrapper.unmount()
  })
})
