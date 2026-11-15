import assert from 'node:assert/strict'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, it, vi } from 'vitest'
import AppModal from '../../app/components/AppModal.vue'
import ConfirmDialog from '../../app/components/ConfirmDialog.vue'
import { useDialogMocks } from './dialog-support'

useDialogMocks()

describe('modal acessível e preservação do rascunho', () => {
  it('mantém Tab e Shift+Tab no ciclo dos controles visíveis e habilitados', async () => {
    class Rectangles extends Array<DOMRect> implements DOMRectList {
      item(index: number): DOMRect | null {
        return this[index] ?? null
      }
    }
    const wrapper = mount(AppModal, {
      attachTo: document.body,
      props: { id: 'focus-modal', title: 'Produto' },
      slots: {
        default:
          '<input id="focus-field"><button id="disabled-field" disabled>Indisponível</button><button id="last-field">Salvar</button>',
      },
    })
    for (const element of wrapper.findAll<HTMLElement>('button, input')) {
      vi.spyOn(element.element, 'getClientRects').mockReturnValue(
        new Rectangles(new DOMRect(0, 0, 40, 40)),
      )
    }
    wrapper.get<HTMLElement>('#last-field').element.focus()
    await wrapper.get('dialog').trigger('keydown', { key: 'Tab' })
    assert.equal(document.activeElement, wrapper.get('.modal-close').element)
    await wrapper.get('dialog').trigger('keydown', { key: 'Tab', shiftKey: true })
    assert.equal(document.activeElement?.id, 'last-field')
    await wrapper.get('dialog').trigger('keydown', { key: 'Escape' })
    assert.equal(wrapper.emitted('close'), undefined)
    wrapper.unmount()
  })
  it('identifica o diálogo, posiciona foco e devolve foco/rolagem ao fechar', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    document.body.style.overflow = 'auto'
    const wrapper = mount(AppModal, {
      attachTo: document.body,
      props: {
        id: 'test-modal',
        title: 'Novo produto',
        description: 'Preencha os dados.',
        initialFocus: '#test-name',
      },
      slots: { default: '<label for="test-name">Nome</label><input id="test-name">' },
    })
    assert.equal(wrapper.get('dialog').attributes('aria-modal'), 'true')
    assert.equal(wrapper.get('dialog').attributes('aria-labelledby'), 'test-modal-title')
    assert.equal(wrapper.get('dialog').attributes('aria-describedby'), 'test-modal-description')
    assert.equal(document.activeElement?.id, 'test-name')
    assert.equal(document.body.style.overflow, 'hidden')
    await wrapper.get('.modal-close').trigger('click')
    assert.equal(wrapper.emitted('close')?.length, 1)
    wrapper.unmount()
    await flushPromises()
    assert.equal(document.body.style.overflow, 'auto')
    assert.equal(document.activeElement, opener)
    document.body.style.overflow = ''
    opener.remove()
  })
  it('confirma descarte sem perder campos e permite continuar editando ou usar Escape para voltar', async () => {
    const wrapper = mount(AppModal, {
      attachTo: document.body,
      props: { id: 'draft-modal', title: 'Nova despesa', dirty: true, initialFocus: '#draft-name' },
      slots: { default: '<input id="draft-name" value="Energia">' },
    })
    await wrapper.get('dialog').trigger('cancel')
    assert.equal(wrapper.emitted('close'), undefined)
    assert.equal(wrapper.get('dialog').attributes('role'), 'alertdialog')
    assert.equal(document.activeElement?.textContent?.trim(), 'Continuar editando')
    await wrapper.get('.discard-confirmation button:first-child').trigger('click')
    assert.equal(wrapper.get<HTMLInputElement>('#draft-name').element.value, 'Energia')
    assert.equal(document.activeElement?.id, 'draft-name')
    await wrapper.get('dialog').trigger('cancel')
    await wrapper.get('dialog').trigger('cancel')
    assert.equal(wrapper.get('dialog').attributes('role'), 'dialog')
    assert.equal(wrapper.emitted('close'), undefined)
    await wrapper.get('.modal-close').trigger('click')
    await wrapper.get('.discard-confirmation button:last-child').trigger('click')
    assert.equal(wrapper.emitted('close')?.length, 1)
    wrapper.unmount()
  })
  it('bloqueia fechamento enquanto grava e protege recarga com rascunho', async () => {
    const wrapper = mount(AppModal, { props: { id: 'busy-modal', title: 'Venda', busy: true } })
    await wrapper.get('dialog').trigger('cancel')
    await wrapper.get('.modal-close').trigger('click')
    assert.equal(wrapper.emitted('close'), undefined)
    const reload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(reload)
    assert.equal(reload.defaultPrevented, true)
    await wrapper.setProps({ busy: false })
    const cleanReload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanReload)
    assert.equal(cleanReload.defaultPrevented, false)
    await wrapper.get('dialog').trigger('cancel')
    assert.equal(wrapper.emitted('close')?.length, 1)
    wrapper.unmount()
  })
  it('só fecha pelo fundo quando o gesto começa e termina fora do painel', async () => {
    const wrapper = mount(AppModal, { props: { id: 'outside-modal', title: 'Produto' } })
    const dialog = wrapper.get('dialog')
    vi.spyOn(dialog.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 20, 400, 400))
    dialog.element.dispatchEvent(new MouseEvent('pointerdown', { clientX: 50, clientY: 50 }))
    await dialog.trigger('click', { clientX: 0, clientY: 0 })
    assert.equal(wrapper.emitted('close'), undefined)
    dialog.element.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0 }))
    await dialog.trigger('click', { clientX: 0, clientY: 0 })
    assert.equal(wrapper.emitted('close')?.length, 1)
    wrapper.unmount()
  })
  it('leva foco ao erro, mantém texto seguro sem apagar o rascunho', async () => {
    const wrapper = mount(AppModal, {
      attachTo: document.body,
      props: { id: 'error-modal', title: 'Despesa' },
      slots: { default: '<input value="Aluguel">' },
    })
    await wrapper.setProps({ error: 'Não foi possível salvar. <script>segredo</script>' })
    await flushPromises()
    assert.equal(document.activeElement, wrapper.get('[role="alert"]').element)
    assert.equal(wrapper.find('script').exists(), false)
    assert.equal(wrapper.find('a').exists(), false)
    assert.equal(wrapper.get<HTMLInputElement>('input').element.value, 'Aluguel')
    wrapper.unmount()
  })
  it('restaura foco em um destino existente quando o botão de origem saiu da lista', async () => {
    const fallback = document.createElement('button')
    fallback.id = 'modal-fallback'
    document.body.append(fallback)
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const wrapper = mount(AppModal, {
      attachTo: document.body,
      props: { id: 'fallback-modal', title: 'Produto', fallbackFocus: '#modal-fallback' },
    })
    opener.remove()
    wrapper.unmount()
    await flushPromises()
    assert.equal(document.activeElement, fallback)
    fallback.remove()
  })
  it('inicia confirmação destrutiva em Cancelar e impede confirmar durante a operação', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      props: {
        id: 'confirm-modal',
        title: 'Remover despesa?',
        description: 'Sem desfazer.',
        confirmLabel: 'Remover despesa',
        danger: true,
      },
    })
    assert.equal(document.activeElement, wrapper.get('.confirmation-cancel').element)
    assert.equal(wrapper.get('dialog').attributes('role'), 'alertdialog')
    await wrapper.get('.confirmation-actions button:last-child').trigger('click')
    assert.equal(wrapper.emitted('confirm')?.length, 1)
    await wrapper.setProps({ busy: true })
    await wrapper.get('.confirmation-actions button:last-child').trigger('click')
    await wrapper.get('dialog').trigger('cancel')
    assert.equal(wrapper.emitted('confirm')?.length, 1)
    assert.equal(wrapper.emitted('close'), undefined)
    wrapper.unmount()
  })
})
