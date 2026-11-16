# Sistema Web de Apoio à Decisão para Pequenos Negócios

Projeto de portfólio desenvolvido para o curso de Engenharia de Software da Católica de Santa Catarina.

## Sobre o projeto

Este projeto propõe o desenvolvimento de um sistema web de apoio à decisão para pequenos negócios do setor varejista, com foco em padarias.

A proposta busca auxiliar empreendedores que registram vendas, despesas e dados operacionais, mas possuem dificuldade para transformar essas informações em decisões práticas para melhorar o desempenho do negócio.

## Problema

Muitos pequenos negócios possuem dados sobre faturamento, fluxo de caixa, despesas, produtos vendidos e margem de lucro, porém utilizam essas informações apenas para consulta ou controle básico.

Com isso, oportunidades de melhoria podem passar despercebidas, como gastos excessivos, produtos pouco lucrativos, períodos de baixa performance e desperdícios operacionais.

## Proposta de solução

O sistema web pretende reunir dados financeiros e operacionais do negócio, analisá-los e gerar insights e sugestões úteis para o proprietário.

Entre as funcionalidades previstas estão:

- cadastro e organização de dados financeiros;
- controle de vendas, despesas e fluxo de caixa;
- análise de margem de lucro por produto;
- identificação de produtos mais e menos lucrativos;
- alertas sobre gastos excessivos;
- análise de períodos de baixa performance;
- identificação de sazonalidade;
- geração de sugestões para melhorar resultados.

## Inovação

O diferencial da proposta está em não apenas registrar e exibir dados, mas interpretar essas informações e transformá-las em recomendações acionáveis.

Enquanto muitas ferramentas focam em controle financeiro e relatórios, este projeto busca oferecer apoio ativo à tomada de decisão, com sugestões contextualizadas para pequenos negócios.

## Tecnologias previstas

- Front-end web;
- Back-end para regras de negócio e APIs;
- Banco de dados relacional;
- Dashboards e relatórios;
- Mecanismos de análise baseados em indicadores e regras de negócio.

## Resultados esperados

Espera-se entregar uma aplicação web funcional capaz de apoiar pequenos empreendedores na análise de seus dados financeiros e operacionais.

O sistema deve contribuir para decisões mais conscientes, melhoria da margem de lucro, redução de desperdícios e melhor acompanhamento do desempenho do negócio.

## Autor

Yuri Jovêncio Pereira  
Engenharia de Software  
Católica de Santa Catarina


---

A seção a seguir descreve a implementação atual do VisãoAtiva, com instruções
de execução e limites do protótipo.

# VisãoAtiva

Sistema web de apoio à decisão para pequenos negócios. Reúne produtos, vendas e
despesas e apresenta sugestões explicadas por regras próprias e determinísticas.
Os indicadores representam margem bruta estimada, sem calcular lucro líquido.

Nuxt 4, Vue 3, TypeScript, Nitro, PostgreSQL e Prisma. Interface, API e motor na
mesma aplicação, com testes separados para servidor e componentes.

## Contexto acadêmico

**Sistema Web de Apoio à Decisão para Pequenos Negócios com Geração de Sugestões
para Potencialização de Resultados**, projeto de Portfólio/PAC de Yuri Jovêncio
Pereira, Engenharia de Software da Católica de Santa Catarina.

O foco são pequenos negócios varejistas, especialmente padarias, que precisam
transformar seus registros em decisões práticas. O motor próprio explica os
indicadores, os critérios e as limitações de cada sugestão. O protótipo permite
gerenciar produtos, registrar e corrigir vendas preservando os valores históricos,
registrar despesas e consultar recomendações. Sazonalidade, desperdício, fluxo de
caixa e previsões não são calculados nesta versão. Os testes usam dados sintéticos;
a utilidade das sugestões ainda precisa de validação com usuários reais.

## Execução local

Use Node 24.15+ da linha 24 ou Node 26+, npm 12.2 e Docker Compose.

```bash
npm ci
```

Se ainda não houver `.env`, copie `.env.example` para `.env`. Substitua os dois
marcadores de senha pela mesma senha aleatória hexadecimal, habilite
`LOCAL_PRODUCTS_ENABLED=true` somente no ambiente local e preserve o arquivo
fora do Git. Não sobrescreva um `.env` existente.

```bash
docker compose up -d --wait db
npm run db:validate
npm run db:generate
npm run db:migrate:deploy
npm run build
npm run preview -- --port 3000
```

Acesse `http://127.0.0.1:3000/`. A página **Início** apresenta o sistema e orienta
os primeiros passos. Pelo menu, acesse **Produtos**, **Vendas e despesas** e
**Visão geral**, com os indicadores e as sugestões. Não há login ou configuração
de conta; qualquer pessoa com acesso ao ambiente local pode usar o sistema.

Páginas e APIs exigem acesso direto local; use build/preview, pois o proxy interno
de `npm run dev` é rejeitado pela proteção atual. Não exponha por túnel ou proxy
público. O sistema é um protótipo local; publicação e pendências de segurança
continuam em aberto. As migrações históricas são preservadas para compatibilidade
com bancos existentes, sem alterar os registros do negócio.

## Demonstração com dados fictícios

Depois do build, execute `npm run demo` e abra
`http://127.0.0.1:3001/sugestoes?to=2026-10-14`.
O comando prepara um schema temporário no PostgreSQL, separado dos seus dados,
com produtos, vendas e despesas fictícios. Confira e confirme os registros para
consultar as sugestões. Cada cartão mostra o cálculo e permite conferir os
registros do período; depois de corrigir uma operação, volte à análise e consulte
novamente. A demonstração é uma simulação, sem comprovação de resultado real.
Encerre com Ctrl+C para remover somente os dados temporários dessa execução.

Para percorrer o exemplo, mantenha a mesma aba e a semana encerrada em 14/10/2026:

1. Confira e confirme os registros: margem bruta estimada de 20%, despesas/receita
   de 65% e variação de receita de −25%, além do aviso independente do cadastro.
2. Pelo cartão de despesas, simule a correção da despesa fictícia de R$ 487,50
   para R$ 300,00. Volte e confirme novamente: o comparativo mostra 65% → 40%,
   retirando somente a sugestão de despesas.
3. Pelo cartão de margem, simule a correção de uma venda fictícia de 25 unidades:
   preço unitário de R$ 10,00 para R$ 20,00. Receita passa a R$ 1.000,00 e margem
   bruta estimada a 40%; as sugestões de margem e queda deixam de aparecer.
4. No produto fictício, ajuste o cadastro para preço R$ 10,00 e custo R$ 8,00.
   O aviso do cadastro sai, preservando os valores históricos das vendas.

O terminal também apresenta esse roteiro. Para repeti-lo desde o início, encerre
a demo e execute `npm run demo` novamente: cada execução usa um novo schema.
Após encerrar a demo, `npm run test:integration:demo-command` verifica seu início,
isolamento, reinício e limpeza por SIGINT/SIGTERM; exige build e PostgreSQL local.

## Qualidade

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

Cobertura mínima por métrica: 75% no servidor e 25% no frontend. Use
`npm run format` e `npm run lint:fix` para as correções automáticas disponíveis.
