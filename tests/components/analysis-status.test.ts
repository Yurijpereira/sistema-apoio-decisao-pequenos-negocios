import assert from 'node:assert/strict'
import { mount } from '@vue/test-utils'
import { describe, it } from 'vitest'
import AnalysisStatus from '../../app/components/AnalysisStatus.vue'
import type { RuleAnalysis } from '../../shared/types/suggestions.ts'

const analyses: RuleAnalysis[] = [
  {
    ruleId: 'LOW_MARGIN',
    title: 'Margem bruta estimada dos produtos',
    status: 'partial',
    reason: 'Um produto avaliado e um sem vendas suficientes.',
  },
  {
    ruleId: 'EXPENSE_PRESSURE',
    title: 'Peso das despesas na receita',
    status: 'no-alert',
    reason: 'Despesas abaixo do limiar experimental.',
  },
  {
    ruleId: 'SALES_DROP',
    title: 'Comparação de receita',
    status: 'insufficient-data',
    reason: 'A semana anterior só tem um registro de venda.',
  },
]

describe('situação das análises apresentada ao usuário', () => {
  it('diferencia análise parcial, ausência de alerta e falta de dados, preservando os motivos', async () => {
    const wrapper = mount(AnalysisStatus, { props: { analyses } })
    assert.equal(
      wrapper.get('section').attributes('aria-labelledby'),
      wrapper.get('h3').attributes('id'),
    )
    const rows = wrapper.findAll('li')
    assert.equal(rows.length, 3)
    assert.match(rows[0]?.text() ?? '', /Análise parcial.*Um produto avaliado/)
    assert.match(rows[1]?.text() ?? '', /Sem alerta pelo critério.*Despesas abaixo/)
    assert.match(rows[2]?.text() ?? '', /Dados insuficientes.*semana anterior/)
    assert.equal(wrapper.find('.shared-reason').exists(), false)
    await wrapper.setProps({
      analyses: analyses.map((analysis): RuleAnalysis =>
        analysis.ruleId === 'LOW_MARGIN' ? { ...analysis, status: 'attention' } : analysis,
      ),
    })
    assert.match(wrapper.get('[data-analysis-rule="LOW_MARGIN"]').text(), /Atenção identificada/)
    assert.match(wrapper.text(), /cadastro atual são independentes/)
    wrapper.unmount()
  })
  it('explica bloqueio comum uma vez, atualiza período aberto e escapa texto recebido', async () => {
    const reason = 'Confira os registros. <img src=x onerror=alert(1)>'
    const wrapper = mount(AnalysisStatus, {
      props: {
        analyses: analyses.map((analysis): RuleAnalysis => ({
          ...analysis,
          status: 'confirmation-required',
          reason,
        })),
      },
    })
    assert.equal(wrapper.get('.shared-reason').text(), reason)
    assert.equal(wrapper.findAll('li p').length, 0)
    assert.equal(wrapper.findAll('[data-analysis-status="confirmation-required"]').length, 3)
    assert.equal(wrapper.find('img').exists(), false)
    await wrapper.setProps({
      analyses: analyses.map((analysis): RuleAnalysis => ({
        ...analysis,
        status: 'open-period',
        reason: 'Selecione uma semana encerrada.',
      })),
    })
    assert.match(wrapper.get('.shared-reason').text(), /semana encerrada/)
    assert.equal(wrapper.findAll('[data-analysis-status="open-period"]').length, 3)
    assert.equal(
      wrapper.findAll('li').filter((row) => row.text().includes('Período ainda aberto')).length,
      3,
    )
    wrapper.unmount()
  })
})
