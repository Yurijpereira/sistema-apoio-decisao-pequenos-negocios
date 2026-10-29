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

Acesse `http://127.0.0.1:3000/`. No primeiro acesso, configure e confirme a senha
administrativa (15–128 caracteres); depois entre pela tela de login. A configuração
é feita uma única vez e armazena somente o hash no PostgreSQL. Uma conta existente
é preservada. `ADMIN_PASSWORD_HASH` permite provisionamento externo e tem
precedência; se estiver configurado, a tela inicial de configuração fica bloqueada.
O comando opcional `npm run admin:provision` cria uma credencial aleatória local;
a recuperação explícita usa `-- --replace`. Não execute para entrar em conta existente.
Login e APIs exigem acesso direto local; use build/preview, pois o proxy interno
de `npm run dev` é rejeitado pela proteção atual. Não exponha por túnel ou proxy
público. O sistema é um protótipo local; publicação e pendências de segurança
continuam em aberto.

Após entrar, use **Minha conta** no cabeçalho para alterar a senha, informando a senha
atual e confirmando uma nova de 15–128 caracteres. A troca encerra a sessão e
solicita novo login; não altera os registros do negócio.

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

## Documentação acadêmica

A [diretriz Web Apps da faculdade](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/directions/portfolio-directions-webapp.md)
exige requisitos funcionais, casos de uso ou histórias de usuário, diagrama de
arquitetura e instruções de deploy em Wiki vinculada ao repositório. A publicação
dessa Wiki está pendente. A aplicação permanece restrita ao uso local; o deploy
público, HTTPS e a execução remota do pipeline ainda não foram validados.
