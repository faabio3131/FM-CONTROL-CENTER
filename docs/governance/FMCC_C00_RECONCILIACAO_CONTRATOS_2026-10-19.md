# C00 — Reconciliação comercial do FM Command (2026-10-19)
Status: PARCIAL. Evidência de descoberta documental; não é homologação.

## CURRENT comprovado
- Main FMCC: 18f1d1b2c9283fd7f775da97e3b7a74e3c767ada.
- PR #91: 7fde1e1c95d7e77547e5b6f088939311be06518f (Draft). Componente /dashboard/commercial/kordena usa CommercialSourceResolver, KordenaCommercialControlService e KordenaCommercialAdminForm. Billing PostgreSQL isolated 39166031896, F21 39166031895 e Foundation 39166031932: SUCCESS. Outros gates e revisão independente não verificados.
- Kordena PR #230: 691ba84edd1cd663278fb868035b6d1169e90610 (Draft). Contrato docs/commercial-platform/AI_FINOPS_FRANCHISE_RUNTIME_CONTRACT_2026-10-18.md declara Command como UI de configuração; API governada /v1/control-plane/fmcc/catalog/commands como destino. Catálogo comercial versionado do Kordena é autoridade de planos/preços KORDENA_PLAN_A a D, não tabela duplicada FMCC.
- Budget Ledger do Kordena (fm_ai_franchise_budgets_v1; fm_ai_franchise_reservations_v1) é autoridade de orçamento em USD interno FM, com escopo unit e proteção anterior ao provider no AI Router. Enforcement opt-in, sem preço/limites de produção aprovados. Frontend AI FinOps apresenta quotas e 70/90/100 sem expor custos internos.
- Command PR #90: cefa68edfa26c00d85713d672b6d1d99a5e7151b (Draft): governança de identidades Core↔Assistant com autenticação corporativa/step-up, HMAC, nonce e consulta de status. Não constitui contrato geral de sincronização de planos, limites ou QR.
- FMCC billing-schema.ts possui cadastros cliente, planos, assinatura, faturas, gateway, pagamentos e auditoria. IRON D11 usa gateway e outbox governados. Esta evidência não comprova distribuição universal aos demais SaaS.

## Matriz de autoridade
| Domínio | Autoridade de escrita atual | Command | Runtime |
|---|---|---|---|
| Planos/preços Kordena | Catálogo Comercial Kordena | Editor e publish governados | Snapshot local entitlement |
| Clientes/contratos de billing FMCC | Billing FMCC por produto/tenant | Administra assinatura e cobranças | Licença por contrato |
| Orçamento IA Kordena | Budget Ledger Kordena | Edita policy de plano na plataforma comercial | Reserva atômica e limite antes do provider |
| Identidade serviço Assistant | Serviço autoritativo Assistant | Provisiona/revoga via bridge #90 | Valida grants e revogação |
| Configuração QR 45s | Política aprovada, código precisa auditoria específica | Configura política FM | Prazo efetivo menor entre FM e provider |

## C00 pendências de aceitação
1. Inspecionar contratos completos das rotas de comandos Kordena (auth, body, validate, preview, publish, versão, erro, idempotência) e testes de integração em SHAs finais.
2. Reconciliar formalmente autoridade de preço Kordena versus Billing FMCC sem migração paralela; ADR se necessário.
3. Auditar diff da PR #91, testes negativos tenant/produto/role/step-up, gates completos e revisão independente.
4. Verificar reconciliação de configuração Command→SaaS em falhas/timeout, anti-replay, ack e idempotência no plano C04, sem usar ponte de identidade como ponte de preços.
5. Confirmar QR 45s na implementação real de Command+Assistant, inclusive vencimento externo anterior.
6. Registrar evidência E2E de contrato com backend real e transporte de teste antes de certificar C00/C01. Gate operacional externo permanece separado.

## Diretriz C01
Reutilizar a PR #91, não reconstruir editor; aproveitar comandos versionados plan_version.create/validate/preview/publish e price.create/validate/preview/publish. Preços e franquias definitivos dependem de futura decisão FM; jamais criar números fictícios. Reforçar validação e negativas existentes, preservar assinaturas legadas e política comercial. Próximo passo é verificar os contratos completos e gates finais no commit correto.

## Estado
C00: EM ANDAMENTO; C01: CONSTRUÇÃO EM TESTES na PR #91. Nenhum merge, deploy, cobrança, migration operacional nem segredo real foram aplicados nesta etapa.
