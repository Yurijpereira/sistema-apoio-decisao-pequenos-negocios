import assert from 'node:assert/strict'
import { mount } from '@vue/test-utils'
import { describe, it } from 'vitest'
import MoneyInput from '../../app/components/MoneyInput.vue'
import { parseCurrencyInput } from '../../shared/utils/money.ts'

describe('máscara monetária em reais', () => {
  it('converte valores digitados ou colados por partes inteiras, sem arredondar ou truncar', () => {
    for (const [text, cents] of [
      ['R$ 1.234,56', 123456],
      ['1.234,56', 123456],
      ['0,29', 29],
      ['0.29', 29],
      ['0', 0],
      ['R$\u00a021.474.836,47', 2147483647],
    ] as const) {
      assert.equal(parseCurrencyInput(text), cents)
    }
    for (const text of [
      '',
      ' ',
      '1,',
      '-1',
      '1.234',
      '1.23,45',
      '1.234,567',
      'R$ 1,234.56',
      '1e3',
      '21.474.836,48',
      '12abc34',
      'Infinity',
    ]) {
      assert.equal(parseCurrencyInput(text), null)
    }
  })
  it('aplica BRL durante a digitação, completa decimais ao sair e preserva vazio', async () => {
    const wrapper = mount(MoneyInput, {
      props: { id: 'money', modelValue: '1234,56' },
      attrs: { 'aria-describedby': 'help', 'aria-invalid': 'false' },
    })
    const input = wrapper.get<HTMLInputElement>('input')
    assert.match(input.element.value, /^R\$\s1\.234,56$/)
    assert.equal(input.attributes('aria-describedby'), 'help')
    await input.trigger('focus')
    await input.setValue('12,3')
    input.element.setSelectionRange(5, 5)
    await input.trigger('input')
    assert.equal(input.element.value, 'R$\u00a012,3')
    assert.equal(input.element.selectionStart, 5)
    await input.trigger('blur')
    assert.match(input.element.value, /^R\$\s12,30$/)
    await input.setValue('')
    await input.trigger('blur')
    assert.equal(input.element.value, '')
    assert.equal(wrapper.emitted('update:modelValue')?.at(-1)?.[0], '')
    wrapper.unmount()
  })
  it('formata inteiros e colagem decimal sem mudar o valor enviado ou truncar inválidos', async () => {
    const wrapper = mount(MoneyInput, { props: { id: 'money', modelValue: '' } })
    const input = wrapper.get<HTMLInputElement>('input')
    for (const [raw, display, model] of [
      ['1234', 'R$\u00a01.234', '1234'],
      ['R$\u00a01.2345', 'R$\u00a012.345', '12345'],
      ['1234.56', 'R$\u00a01.234,56', '1234,56'],
      ['R$ 1.234,56', 'R$\u00a01.234,56', '1234,56'],
      ['0,29', 'R$\u00a00,29', '0,29'],
      ['21.474.836,47', 'R$\u00a021.474.836,47', '21474836,47'],
      ['1,', 'R$\u00a01,', '1,'],
    ]) {
      assert.ok(raw !== undefined && display !== undefined && model !== undefined)
      await input.setValue(raw)
      assert.equal(input.element.value, display)
      assert.equal(wrapper.emitted('update:modelValue')?.at(-1)?.[0], model)
    }
    for (const invalid of [
      '12abc34',
      '-1',
      '1.234',
      '1,234',
      '21.474.836,48',
      'R$ 1.23,45',
      'R$ 1.23,46',
    ]) {
      await input.setValue(invalid)
      await input.trigger('blur')
      assert.equal(input.element.value, invalid)
      assert.equal(
        parseCurrencyInput(String(wrapper.emitted('update:modelValue')?.at(-1)?.[0])),
        null,
      )
    }
    wrapper.unmount()
  })
  it('mantém a seleção ao reagrupar milhares e permite apagar nos dois lados do separador', async () => {
    const wrapper = mount(MoneyInput, { props: { id: 'money', modelValue: '1234,56' } })
    const input = wrapper.get<HTMLInputElement>('input')
    input.element.value = 'R$\u00a019.234,56'
    input.element.setSelectionRange(5, 5)
    await input.trigger('input')
    assert.equal(input.element.selectionStart, 5)
    assert.equal(wrapper.emitted('update:modelValue')?.at(-1)?.[0], '19234,56')
    input.element.setSelectionRange(5, 5)
    await input.trigger('beforeinput', { inputType: 'deleteContentForward' })
    assert.equal(input.element.value, 'R$\u00a01.934,56')
    assert.equal(wrapper.emitted('update:modelValue')?.at(-1)?.[0], '1934,56')
    input.element.setSelectionRange(5, 5)
    await input.trigger('beforeinput', { inputType: 'deleteContentBackward' })
    assert.equal(input.element.value, 'R$\u00a0934,56')
    assert.equal(wrapper.emitted('update:modelValue')?.at(-1)?.[0], '934,56')
    wrapper.unmount()
  })
  it('aguarda composição de texto e reflete o reset externo mesmo durante a edição', async () => {
    const wrapper = mount(MoneyInput, { props: { id: 'money', modelValue: '10,00' } })
    const input = wrapper.get<HTMLInputElement>('input')
    await input.trigger('compositionstart')
    await input.setValue('1234,56')
    assert.equal(wrapper.emitted('update:modelValue'), undefined)
    await input.trigger('compositionend')
    assert.equal(input.element.value, 'R$\u00a01.234,56')
    assert.equal(wrapper.emitted('update:modelValue')?.at(-1)?.[0], '1234,56')
    await wrapper.setProps({ modelValue: '' })
    assert.equal(input.element.value, '')
    wrapper.unmount()
  })
  it('aceita o ponto do teclado numérico como separador decimal após o milhar', async () => {
    const wrapper = mount(MoneyInput, { props: { id: 'money', modelValue: '1234' } })
    const input = wrapper.get<HTMLInputElement>('input')
    input.element.value = 'R$\u00a01.234.56'
    input.element.setSelectionRange(9, 9)
    input.element.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: '.',
      }),
    )
    assert.equal(input.element.value, 'R$\u00a01.234,56')
    assert.equal(wrapper.emitted('update:modelValue')?.at(-1)?.[0], '1234,56')
    wrapper.unmount()
  })
  it('mantém entrada inválida visível para correção e reflete mudanças externas do formulário', async () => {
    const wrapper = mount(MoneyInput, { props: { id: 'money', modelValue: '' } })
    const input = wrapper.get<HTMLInputElement>('input')
    await input.setValue('21.474.836,48')
    await input.trigger('blur')
    assert.equal(input.element.value, '21.474.836,48')
    await wrapper.setProps({ modelValue: '0,00' })
    assert.match(input.element.value, /^R\$\s0,00$/)
    wrapper.unmount()
  })
})
