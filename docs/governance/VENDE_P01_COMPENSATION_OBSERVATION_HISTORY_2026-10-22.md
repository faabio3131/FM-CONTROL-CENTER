# VendeAtendeIA P01 — histórico verificável das observações de compensação

**Natureza:** construção interna; somente leitura do audit log do FM Command.
**Unidade de trabalho:** risco financeiro após entrega C06, triagem humana, observações assinadas do Assistant e evidência financeira vinculada à fatura.

## Fluxo implementado
1. Uma divergência comercial previamente detectada cria `vende.compensation_review.required`.
2. Operador corporativo FM autentica e registra `investigating` / `escalated` com step-up, sem mutar licenças.
3. Leitura assinada de operação do Assistant e verificação de fonte financeira resultam em `vende.compensation_review.remote_observed`. O mesmo commit armazena um registro auditável, mesmo quando nenhuma ação corretiva acontece.
4. A API `GET /api/billing/products/{productId}/vende-compensation-evidence/{commandId}/history` exige identidade corporativa, produto VendeAtendeIA ativo, escopo do comando, evidência de risco do produto e oferece apenas **10** observações, ordenadas por timestamp do audit log e ID.
5. O painel FM consulta o histórico separadamente da observação fresca, com aviso permanente: **registro histórico não prova situação atual nem autoriza reparação**.

## Segurança e limites
- Nenhum write, refund, transição contratual, dispatch, cron ou chamada externa no endpoint de histórico.
- Registros cross-tenant / outro produto / comando inexistente negados. O resultado HTTP é `no-store`, sem segredos nem metadata arbitrário.
- Categorias históricas de resultado, financeiro e estado da fatura passam por whitelist estrita. Campos desconhecidos tornam-se indeterminados. Dados como IDs externos, gateway payloads e segredos são omitidos.
- `currentLicenseVerified=false`, `currentFinanceVerified=false`, `remediationConfirmed=false` e `caseResolved=false` permanecem imutáveis na projeção histórica.
- Truncamento explícito preserva audit ledger completo; histórico não é um contador de incidentes em aberto.
- Não se trata de nova autorização de compensação nem de homologação real do Assistant/PSP.

## Critérios de certificação interna
- Testes unitários da projeção de metadados não confiáveis e da API FM.
- Testes PostgreSQL de leitura após observação real da suíte C06, bloqueio cross-tenant, limite de 10, proveniência, e inexistência de side effects.
- Typecheck, lint, Foundation, Billing PostgreSQL e F21 no SHA da PR. Review independente antes de merge; gates pós-merge quando aplicáveis.

## P01 permanece incompleto
O fechamento de uma divergência exige **ação corretiva transacional governada**, com aprovação humana, provas atuais financeira/Assistant, idempotência, confirmação remota e recuperação de falhas. Este WP agrega o histórico de investigação, **não** declara reparação nem encerra P01.
