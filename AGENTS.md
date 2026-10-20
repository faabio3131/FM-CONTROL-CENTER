# AGENTS.md — FM CONTROL CENTER / Command corporativo

**Obrigatório para esta branch e suas alterações.** Preserva o sistema FM Command existente, suas normas corporativas, ADRs, gates e rastreabilidade. Não redefine nem enfraquece contratos anteriores.

## Autoridade e escopo

1. Documento Mestre e Padrões de Construção Nova FM Tecnologia.
2. ADRs, runbooks e cronograma existentes do FM CONTROL CENTER.
3. Para a integração F3.7.3: System Design, Prompt Mestre, ADRs e `AGENTS.md` do `faabio3131/-FM-Assistant-Base`, incluindo seu `docs/governance/EXECUTION_TRACKER_MASTER.md`.
4. CURRENT comprovado por HEAD, diff, testes, GitHub Actions e banco, não por memória ou promessas.

**Identidade dos repositórios:** `FM-CONTROL-CENTER` é o Command interno da FM. `fm-command-v2` é outro produto; não alterar nem delegar a ele a autoridade corporativa. Kordena `fm-ai-platform` é read-only.

## Execução autônoma, contínua e disciplinada

- Ler AGENTS + tracker do Assistant e confirmar branch/HEAD/PR, fase F3 e blockers antes de qualquer mudança.
- Executar por menor unidade consistente: CURRENT → critérios/risco → código+testes → lint/typecheck/test/build → revisão diff/segurança → CI → registro no tracker → próximo item.
- **Gate verde 100%:** avançar automaticamente dentro da sequência aprovada, sem solicitar confirmação repetida.
- **Gate vermelho:** investigar causa, corrigir e retestar automaticamente; nunca pular/enfraquecer/desabilitar testes ou barreiras.
- **BLOCKED_EXTERNAL:** registrar evidência, causa e último SHA; testes locais são evidência auxiliar, não convertem CI obrigatório em GREEN. Não avançar fase nem mergear PR.
- Evitar concorrência destrutiva; comparar HEAD e revalidar gates quando houver commits concorrentes.
- Atribuir com precisão estados CURRENT/TARGET/DECISÃO/PENDÊNCIA/BLOCKED_EXTERNAL; não inventar PR aprovada, deploy, provedor homologado ou assinatura válida.
- Atualizar arquivos `AGENTS.md` pertinentes e o tracker canônico do Assistant a cada checkpoint material.

## F3.7.3 — autoridade de identidades e grants

- O Command governa o lifecycle de identidades Core de serviço; **não acessa diretamente banco/segredos do Assistant**.
- Toda mutação exige sessão Better Auth verdadeira, organização corporativa FM explicitamente configurada, papel owner/admin dessa organização, step-up humano recente da mesma conta e auditoria.
- Actor/organização e key ID alvo são **derivados server-side**, não de payload cliente. Um admin de tenant cliente nunca é admin da plataforma.
- Usar HMAC dedicado Command→Assistant, origin HTTPS limpo, timestamp, nonce e corpo exato. Segregar chaves Command/Core/Vault. Sem segredos nos logs, frontend ou código.
- Lifecycle: provision → grant(tenant,unit,capability) → revoke_grant/revoke_identity, com registro determinístico e revogação efetiva no Assistant.
- Não liberar chave, não reativar identidade revogada sem novo ID/segredo e processo governado; não permitir retry cego quando resultado da mutação for ambíguo.
- Exigir teste de spoof, cross-org/tenant, step-up inválido/expirado, replay, revogação, atomicidade, testes PostgreSQL com concorrência e E2E real Command→Assistant.
- O contrato de gestão ainda não é considerado homologado até credenciais/rede/Vault/CI reais; nenhum segredo real deve ser usado em teste não autorizado.

## Regras de gates, merge e deploy

- Gate da PR Command #90 depende de **lint, typecheck, tests, build, revisão independente de segurança e contrato E2E**, não apenas do CI do Assistant.
- Jobs GitHub Actions que encerram com **zero steps** são `BLOCKED_EXTERNAL / NOT_TESTED`; não diagnosticar como falha funcional sem logs.
- Merge pode ocorrer autonomamente **somente** quando todos os gates obrigatórios da entrega estiverem 100% GREEN, PR mergeable, documentação e tracker atuais e nenhuma STOP condition.
- Deploy/produção, migration em banco produtivo, credenciais reais, cutover, gasto ou mudança irreversível: exigem autorização humana específica, independentemente de merge verde.
- F3 do produto permanece IN_PROGRESS; não marcar F4 iniciada enquanto F3 não estiver totalmente verde.

## STOP conditions

Parar promoção, preservar evidência e corrigir: bypass de autenticação/step-up, privilégio indevido, cross-tenant, vazamento de segredo/PII, falsificação de auditoria, replay, race de revogação, mutation sem registro, incoerência de CI, migration destrutiva, mudança de arquitetura sem ADR, deploy não autorizado.

## Ferramentas

Preferir GitHub e ambiente de execução próprio. **MCP Commander remoto somente se indispensável**, para preservar os créditos do usuário. Nunca alegar teste executado se ele não executou.


## F3.7.4 — Gate PostgreSQL no Assistant (2026-10-18)

- Assistant `6dd2d9f7ebf84fa140ae7380f6f0386387500ca9` passou PostgreSQL 16 de replay simultâneo, revogação de grant/identidade e auditoria em **duas execuções CI** (`39139495756`, `39139500097`).
- Este verde é apenas do Assistant. **A PR #90 Command permanece bloqueada** porque os workflows terminam sem executar etapas; não tratar como CI aprovado. Investigar infra/Billing e executar lint, typecheck, tests, build, review de segurança e contrato E2E Command→Assistant.
- Manter F3 IN_PROGRESS e F4 NOT_STARTED. Não aplicar credenciais reais, migrations produtivas, deploy ou merge antes de 100% dos gates obrigatórios.


## F3.7.5 — Segurança e contrato Node/Python (2026-10-18)

- A implementação passou a auditar negativas de autorização corporativa e payload inválido; indisponibilidade da auditoria jamais deve permitir mutação.
- Testes de regressão em `tests/f3-command-core-bridge-route.unit.test.ts`; cross-runtime real Node signer → FastAPI ASGI em `tests/f3_command_assistant_cross_runtime.py` e runner `.mts`, via Foundation Gate.
- O Assistant é checkout **público, pinado** em SHA funcional, sem token de produção. Credenciais e usuários de teste são exclusivamente sintéticos.
- O transporte é capturado antes da rede e entregue ao TestClient ASGI; não declarar HTTPS/TLS produtivo ou Vault homologado com base nesse teste.
- **STOP de confiabilidade:** reconciliação por command_request_id entre mutação já confirmada no Assistant e eventual falha de auditoria/retorno no Command permanece a projetar/testar. Sem retries cegos.
- **CI Command no HEAD `045168112162902111972c7bda819e436a5e7e69`:** workflows Foundation `39141682746`, F21 `39141682831`, Cognitive `39141682750` finalizaram sem executar os steps. O novo E2E é `NOT_TESTED / BLOCKED_EXTERNAL`; não promover fase nem mergear. Obter revisão independente real.
- Não alterar as proibições de deploy, secret real, migration produtiva ou Kordena read-only.


## F3.7.6 — Durable audit intent (2026-10-18)

- Antes de transmitir qualquer mutação Command→Assistant, persistir `fm_core.bridge.<action>.requested` com `commandRequestId` UUID server-side, ator, identidade e escopo, em `fmcc_audit_event`.
- A **mesma** referência deve ser assinada no corpo HMAC como `command_request_id`, depois usada nas auditorias de conclusão e falha. Não enviar se a gravação inicial falhar.
- Respostas de timeout/503 **não provam** que o Assistant não executou; nunca repetir automaticamente. Usar a referência persistida para futura reconciliação somente leitura e auditoria canônica do Assistant.
- Preauditoria NÃO substitui reconciliação real, garantia de entrega, consistência distribuída, testes CI ou revisão independente.
- Código/testes Command adicionados; CI do repositório segue encerrando sem steps. F3 IN_PROGRESS, Command NOT_TESTED/BLOCKED_EXTERNAL; merge/deploy proibidos enquanto gates faltarem.


## F3.7.7 — Reconciliação read-only com prova transacional (2026-10-18)

- Única origem autorizada de lookup é um intent corporativo previamente gravado, para o mesmo ator/organização autenticados. Nenhum tenant pode escolher identity/grant alvo, ator, scope ou tenant a consultar.
- `POST /api/integrations/fm-core/bridge/identities/status` exige Better Auth, role corporativa e step-up por senha da mesma conta, e **não executa mutação**; deriva todos os campos sensíveis de `fmcc_audit_event`.
- Chamada HMAC read-only `/internal/v1/command/core-bridge/status` usa canonical path distinto do manage; verifica response exata e nunca autoriza retry quando `unknown` ou timeout.
- Assistant migration aditiva `20261018_0007` garante unicidade por `command_request_id`; seu gate SaaS/PG/bridge aprovado em `c65f05f73546380f1641611d96d6a3bd74c3a0b3`.
- Código e testes Command de status + E2E sintético Node/Python estão **implementados mas NOT_TESTED**: Actions privados encerram com `steps=0`. Não presumir verde; F3 continua IN_PROGRESS, F4 NOT_STARTED.
- Testes reais com proprietário somente após CI/segurança: PostgreSQL staging, HTTPS/Vault, segredos segregados e aprovação humana para credenciais/deploy/migration não descartável.
- Nunca desativar gate por custo ou converter `BLOCKED_EXTERNAL` em `GREEN`; reexecutar, investigar e corrigir. Nenhum merge autorizado sem todos os critérios exigidos.


## F3.7.8 — Certificação CI real do Command após desbloqueio (2026-10-18)

- GitHub Actions no repositório corporativo foi desbloqueado após sua mudança de private para public. A anotação histórica confirmada era de pagamentos/limite de gastos; os jobs passaram a executar steps reais, sem alterar controles de segurança.
- **HEAD funcional certificado:** `efd7a89e15a7e02ded3e21e962bce8e5279b00ee`. Gates obrigatórios Command:
  - FMCC Foundation Gate `39145954696`: **SUCCESS**; lint, typecheck, migrations, Vitest, teste E2E sintético Node assinador real ↔ FastAPI ASGI real, varredura de segredos, build Next.js, Playwright, smoke runtime, Docker e audit de dependências.
  - FMCC F21 Operational Readiness Gate `39145954712`: **SUCCESS**; testes adversariais de segurança/tenant, backup+restore PostgreSQL e auditoria.
  - FMCC Cognitive Governed Intelligence Gate `39145954655`: **SUCCESS**; testes cognitivos, regressão integral, build e diff whitespace.
- Falhas intermediárias preservadas: tests env NODE_ENV ausente, whitespace no documento F3 e checkout Assistant dentro da pasta do Next.js; corrigidas com commits `b964dbcf`, `ac870b30` e `efd7a89e`, sem suprimir checks.
- **GREEN certificado é do código no HEAD funcional acima.** Esta atualização documental cria novo HEAD; executar novamente os três workflows até SUCCESS para preservar a regra de CI no HEAD.
- A prova E2E é de runtimes verdadeiros com HTTP interceptado por fixture/TestClient e credenciais sintéticas. **Não equivale** a tráfego HTTPS/ACL, Vault externo, credenciais de serviço reais, ambiente de staging ou homologação de provider.
- F3 GLOBAL permanece `IN_PROGRESS`; F4 `NOT_STARTED`. PR Command #90 continua Draft: revisão independente de segurança, Vault, rede, quotas/circuit/FinOps, providers e homologação real ainda pendentes.
- A autorização prévia de merge só se aplica a PRs com todos os gates **da entrega** aprovados, não a um gate parcial. Nenhum merge, deploy, migration produtiva ou credencial real é permitido com pendências acima. Kordena continua read-only.

## F3.7.9 — Nonce de consulta status e homologação controlada (2026-10-18)

- Assistant implementou e testou nonce durável de consultas status HMAC, com Alembic `20261018_0008` e rejeição de replay/concorrência em PostgreSQL 16; gate Assistant funcional `303747d8efe33536af796d75c698bf01864409a5`, 6/6 SUCCESS.
- A leitura `/internal/v1/command/core-bridge/status` usa status nonce separado de mutações; nonce usado é rejeitado mesmo que o resultado anterior tenha sido `unknown`; status não altera grants.
- O Command continua assinando cada lookup com nonce aleatório e HMAC de path distinto; contrato de mutação e governança FM não mudam.
- Runbook `docs/FMCC_F3_CONTROLLED_STAGING_VALIDATION_RUNBOOK.md` define pré-condições e critérios de GO/NO-GO para testes com recursos reais. **Não autoriza deploy/credenciais/migrations reais** e não substitui revisão independente.
- Obrigatório definir antes de produção política de retenção e rate limits para ledger de nonce, Vault/ACL/TLS e custos/quotas; manter PR #90 Draft, F3 IN_PROGRESS, sem merge até gates globais.

## DIRETRIZ 2026-10-18 — BUILD COMPLETE FIRST / EXTERNAL HOMOLOGATION LAST

- Decisão expressa do proprietário: implementar integralmente todas as funcionalidades internas de F3 e das fases seguintes antes de solicitar provas reais de Command/Vault/identidades/ambientes externos.
- Credenciais reais, redes TLS/ACL, provedores terceiros, DNS, publicações e homologação externa são `EXTERNAL_HOMOLOGATION_DEFERRED`. Registrar adapters, contratos, testes sintéticos e cenários E2E internamente e continuar autonomamente sem bloquear programação.
- Os gates internos, incluindo RBAC/step-up, HMAC/replay, isolamento tenant, auditoria, PostgreSQL efêmero, unit/E2E/lint/build/CI e revisões técnicas possíveis, continuam obrigatórios e não podem ser ignorados.
- Uma fase pode ser `BUILD_COMPLETE_INTERNAL_GREEN` e sua sucessora iniciada sem `REAL_HOMOLOGATION_APPROVED`. O status real continua pendente; não anunciar operação de produção.
- Deploy, segredos reais, migrations não descartáveis, gastos ou mudanças irreversíveis continuam proibidos sem aprovação específica. Merge somente após gates internos completos e prova de ausência de efeitos automáticos de deploy.
- Fonte canônica: `faabio3131/-FM-Assistant-Base/docs/governance/F3_BUILD_FIRST_EXTERNAL_HOMOLOGATION_LAST_2026-10-18.md`. As regras antigas que bloqueavam **a construção** por integração real são superadas por esta ordem; segurança e governança permanecem intactas.

## F3/F9 — GOVERNANÇA DOS PLANOS/IA POR PRODUTO (2026-10-18)

- O Command corporativo governa catálogo e preço comercial por `product_id + plan_code + plan_revision`, sem misturar pagamentos nem assinaturas de produtos distintos. O SaaS mantém estado canônico de licença por `tenant_id`; Core só aplica cota técnica e controla gasto de IA.
- Custos de modelos de IA/FM-managed são responsabilidade da FM Tecnologia, reconciliados em FinOps separado de invoice/MRR do assinante. O cliente recebe limites de consumo configuráveis por plano; não fornece a chave de IA nem paga diretamente ao provedor em modo FM-managed.
- Limites: tokens input/output/cached/total, requests, áudios, mensagens, assentos, unidades, storage, CRM e automações; projeto por tenant/unidade, hard-stop sem overage aprovado, revisões pinadas por licença e expiração/revogação propagadas.
- Criar interfaces, sincronização autenticada Command→Assistant→Core, alertas, painéis e provas sintéticas internamente, sem parar desenvolvimento por homologação externa.
- Fonte: `docs/FMCC_F3_F9_COMMERCIAL_PLANS_AND_AI_COST_CONTROL.md`. Estado atual é arquitetura/infra parcial, não fluxo comercial completo. Não publicar preços/limites definitivos sem política comercial.

## ADR-009 — FM ADMINISTRA 100% PREÇOS E FRANQUIAS; SEM FEATURE GATING (18/10/2026)

- Decisão do proprietário: VendeAtendeIA terá **todas as funcionalidades em todos os planos**. A diferenciação é exclusivamente preço comercial e franquia quantitativa de consumo; não criar feature flags por plan_code, tiers com menu bloqueado nem upsell necessário para abrir um módulo.
- Apenas operadores autorizados da FM no Command poderão editar preço, moeda, periodicidade e limites por `product_id + plan_code + revision`. Exigir RBAC corporativo/step-up, trilha de auditoria e publicação versionada; nunca delegar a cliente a capacidade de elevar quota.
- Kordena `main` é referência de metering/projeção, mas **PR #230 Draft** implementa também budget transacional monetário, guard pré-provider e customer view. Reaproveitar padrões, com gate interno e sem assumir prontidão/merge do Kordena. Command continua autoridade única de preços comerciais e limites da FM, sem feature gating por tier; Core é fonte de aplicação transacional e FinOps.
- A arquitetura canônica está em `faabio3131/-FM-Assistant-Base/docs/governance/ADR-009-ALL-FEATURES-PLAN-CONSUMPTION-AND-KORDENA-FINOPS.md`. Implementar administração comercial e propagação governada sem depender de homologação externa, sem afetar produção.

## F3/F9 — ENVELOPE CRIPTOGRÁFICO DE VÍNCULO DA LICENÇA (2026-10-18)

- `signAssistantPlanLicenseBind` cria envelope Command→Assistant, com HMAC e path `/internal/v1/command/assistant-plans/bind`, distinto de publicação de planos. Inclui produto fixo VENDEATENDEIA, corporate organization, aprovação/ator, tenant e revisão específica; nunca status pago, duração de trial ou valor de fatura.
- O Assistant só aceita vinculação inicial de licença válida e revisão FM publicada, registra auditoria e recusa replay/alteração silenciosa. Não introduzir endpoint tenant de elevação, upgrade não auditado ou cobrança fictícia.
- Ainda falta integrar concessão canônica de assinatura F9 ao despacho deste envelope com outbox seguro e aprovação de fluxo; signer puro não é despacho de grants. Não afirmar que assinatura está sincronizada automaticamente.
- Editor corporativo FM continua somente para limites quantitativos; todas as funcionalidades são iguais em todos os tiers e custos dos modelos são despesa FM. Sem deploy, credenciais reais ou integração externa antes de BUILD_COMPLETE.


## FM Corporate WhatsApp QR Display Policy (2026-10-19)
- Approved corporate default: **45 seconds**. The FM Command owns display cap setting for VendeAtendeIA, not tenants/customers. The provider's actual QR validity is independent; effective cap can never exceed remaining provider validity.
- Command implementation: dedicated schema and additive Drizzle migration `0013_whatsapp_qr_policy`, `WhatsAppQRPolicyService`, `/api/billing/products/[productId]/whatsapp-qr-policy`, product settings editor. FM corporate organization owner/admin, commercial RBAC, password reauthentication, optimistic revision and append-only audit required. Range 15-120 seconds; default 45 if unset. No deploy, production migration or merge.
- Note: Command→Assistant signed policy projection is a **remaining integration gate**. Until implemented and tested, the Assistant enforces its own approved 45s default but does NOT dynamically consume Command edits. Never claim configuration propagation is complete.


## F3 — 2026-10-20 Command signed AI usage recovery and three-codebase test

- Added `src/application/integration/fm-core-ai-recovery-jwt.ts`: approved human FM platform_admin with recent step-up and corporate organization may create a short-lived RS256 bearer for the exact Core recovery audience; a guarded HTTPS client sends one opaque evidence ID and request/revision tuple with no redirects, no secret logging, no automatic retry after ambiguous failure.
- Added unit tests for wrong organization, expired step-up, unapproved human actor, unsafe origin, signed payload and failure-without-retry.
- Command Foundation gate now checks out pinned public Assistant `ab30a89bfe4d15937b15ab0cc7ebb033030af803` and Core `3733c25e39d2c9df1203b4c9834604c7c96dbcb8` and runs both the existing production Node→Assistant signed-envelope test and new `tests/f3_command_assistant_core_usage_recovery.py`: real Command signer, Assistant ASGI permission and revocation handlers, Core quota projection/reservation and opt-in RS256 recovery API on SQLAlchemy, gateway-signed immutable evidence record, one settlement and duplicate denial. No provider keys or real payments.
- IMPORTANT: tests are *cross-codebase synthetic integration*, not three independently deployed server processes or live network/TLS certification. FM Gateway HMAC attests to the internal verifier source and does not independently prove an external provider bill. Core production recovery endpoint remains UNMOUNTED until a trustworthy upstream provider evidence verifier is certified.
- PR #90 remains Draft; no merges, deploy, credentials or real migrations. User decision BUILD_COMPLETE_FIRST/EXTERNAL_HOMOLOGATION_LAST remains in force. Keep F3 BUILD_IN_PROGRESS until independent provider proof, operational three-service network E2E, security review and all internal schedule gates close.


## F3 — 2026-10-19 LOOPBACK NETWORK PROCESSES + SOURCE PROOF GATE

- `tests/f3_three_process_network.py` and `tests/f3_network_test_server.py` launch real pinned Assistant and Core ASGI uvicorn worker processes on ephemeral loopback ports and use actual Node Command signer subprocess. Core data lives in a **dedicated disposable PostgreSQL database** with bounded teardown; tests exercise signature/replay revocation, Core reservation, upstream synthetic Ed25519-signed provider evidence, gateway-scope immutability, signed Command recovery, duplicate settlement denial and final token balances.
- Foundation workflow pins Assistant `ab30a89bfe4d15937b15ab0cc7ebb033030af803` and green Core `78885dc4383255678b7639163c9c33975dfb793a`, installs isolated Psycopg and runs both prior cross-codebase fixtures and the real loopback network gate. Command functional SHA `410f6ae86f8b30e5cb615d3dd00f715704e99b4d`: Foundation Gate `39353872093` SUCCESS, F21 `39353872096` SUCCESS, Billing PG `39353871920` SUCCESS, Cognitive `39353872019` SUCCESS.
- This gate does NOT validate hosted Command server HTTP, TLS/ACL, real provider-issued Ed25519 statements from generic LLMs, nor distributed cross-DB atomicity. Provider-specific verification of unsigned usage sources remains an internal adapter requirement; real external provider calls deferred to post-build homologation.
- F3/F9 still `BUILD_IN_PROGRESS`. Remaining internal construction: billing entitlement outbox to Assistant tenant license/grant, guarded policy projection/revocation Assistant→Core, per-attempt official provider metering/FinOps, further operational recovery and final adversarial review. Reference Assistant `docs/governance/F3_INTERNAL_GATE_RECONCILIATION_2026-10-19.md`. Command PR #90 remains Draft; no merge/deploy, live credentials, production migrations or payment cutover.


## F3/F9 — 2026-10-19 Vende paid license to transaction quota handoff

- Implemented additive Drizzle migration `0014_vende_paid_license_outbox` and pinned snapshot for `fmcc_billing_vende_license_outbox`; canonical `PostgresCanonicalBillingRepository.markInvoicePaid` atomically creates the paid-license intent for VendeAtendeIA only after persisted received payment, tenant/customer/product mapping, published FM quota plan revision and audit, denying conflicting replay. No webhook/browser is authority to grant a license.
- `assistant-paid-license-outbox.ts` provides single-shot CAS dispatcher, signed FM corporate Assistant `/bind` request, bounded worker drain and fail-closed quarantine on uncertain HTTP; provider timeout never causes blind license reissue. Plan approval timestamp is derived from published plan, not dispatch time. **Draining is a callable internal worker primitive; scheduler activation and blocked-claim reconciliation are separate remaining work**, not falsely claimed deployed.
- Refactored exact HMAC licensing signer into pure `assistant-plan-license-signer.ts` and preserved reexports to avoid importing database modules from Node cross-runtime test. `tests/billing-vende-license-outbox-postgres.test.ts` proves unpaid denial, atomic paid outbox, same-invoice dedupe, corporate isolation, reversed invoice refusal, single-shot dispatch and blocked no-retry on isolated PG. `tests/f3_command_license_quota_journey.py` uses real Command signing, Assistant canonical plan binding/live-license grant and the already-existing Core `SignedAssistantPlanAuthority` + `PlanUsageGuard`, confirming 180-token reservation, replay rejection and license suspension before a subsequent admission; it is **synthetic cross-codebase**, not a real payment gateway or a full distributed production transaction.
- Functional SHA `13621d4b6c103e857e98fd1e32fb42460cf8142a`: FMCC Foundation Gate `39358095382` SUCCESS (including cross-runtime tests), Billing PostgreSQL `39358095405` SUCCESS, F21 Readiness `39358095433` SUCCESS, Cognitive `39358095442` SUCCESS; 4/4 GREEN. Subsequent documentation HEAD must be checked independently.
- Open internal construction: safe scheduler/worker operational activation and governed reconciliation of blocked intents; proper initial paid-license/trial matching for each customer; versioned upgrades/downgrades and recurring invoices with effective-period controls; end-to-end customer billing attribution and authenticated policy revocation across components; final provider metering/FinOps and internal adversarial certification. Command PR #90 remains Draft, no merge/deploy/real secrets/production migrations. Real payment gateway and provider homologations deferred to post-build.


## F3 — 2026-10-20 Commercial entitlement outbox crash and exact audit recovery

- Existing canonical invoice paid→Vende license outbox remains transactional with scoped amount/provider confirmation and one-time signed Assistant bind. Added per-dispatch stable `claimToken` UUID as the actual HMAC request nonce, so the target Assistant audit stores a durable unique identifier for this exact attempt.
- New pure signer `signAssistantPlanBindingStatus` and `reconcileBlockedVendePaidLicense` POST signed read-only status inquiry; only a matching persisted Assistant `PlanBindingAuditORM` nonce and requested plan/revision can promote a blocked outbox attempt to `delivered`, never plan equality alone. Unknown/timeout/mismatched outcome remains blocked and never triggers a blind send. `quarantineStaleVendeLicenseClaims` quarantines crashed/incomplete worker claims; it does not requeue.
- Added Vitest status signer and PG outbox blocked/stale tests plus cross-runtime Node→Assistant signed status check. Pinned Assistant HEAD `c41e640c5be8a7d5f6db3d9c505226f10de95ffd` has 3/3 green gates, but **Command current HEAD is NOT certified**: GitHub returned no workflow runs for this exact commit as checked. Prior green Command SHA `331ac0ced49b9cd39b934e212e3da89cf949567e` cannot certify new code. PR #90 Draft, mergeable=false; forbidden to merge.
- Open internal construction: activate governable scheduler, explicit operator reconciliation when no audited proof exists, support paid renewal/trial conversion/plan change/cancel and effective periods, propagate revocation across Core operation paths, finalize per-attempt provider/audio FinOps, WhatsApp recovery chaos and independent security/regression review. Those are build work, NOT deferred external homologation; follow Master Tracker and do not announce BUILD_COMPLETE_INTERNAL_GREEN.
- User authorized merging only after **every mandatory current-HEAD gate truly green** and PR is conflict-free, not an unconditional merge. No deploy, production migrations, credentials or live provider tests.


## 2026-10-20 F3 controlled progress — audited outbox recovery and current blockers

- Command Vende paid-license outbox now requires matching original `claimToken` as signed Assistant /bind nonce, persisted in Assistant `PlanBindingAuditORM`. New separately HMAC-signed, path-bound `/internal/v1/command/assistant-plans/binding-status` returns only exact-scoped `bound_confirmed` when the persisted binding audit nonce matches; plain same-plan equality is NOT accepted. No blind retry on timeout. `reconcileBlockedVendePaidLicense` checks this proof before CAS blocked→delivered. Already-bound-without-new-audit is not payment-specific delivery proof.
- Worker crash/stale processing claims quarantine to blocked, never pending; a separate operator action must resolve a negative/absent status. Added PostgreSQL negative/positive/stale cases, Vitest HMAC/nonce validation, Command Node→Assistant cross-runtime status proof. Latest Assistant signed status functional SHA `c41e640c5be8a7d5f6db3d9c505226f10de95ffd` passed three exact-SHA workflows. Command Foundation workflow pins this SHA.
- Claim eligibility (persisted invoice PAID/payment RECEIVED/plan PUBLISHED) and durable outbox claim now share a PostgreSQL transaction/row locks; external HTTP cannot be atomic with billing/Assistant, and a subsequent reversal between commit and HTTP remains a cross-service race to certify and mitigate. Do not advertise exactly-once or full financial lifecycle.
- Command latest functional commits presently have **no matching GitHub Actions runs** despite earlier green SHA `331ac0ced49b9cd39b934e212e3da89cf949567e`; PR #90 is Draft, mergeable=false. Run local isolated typecheck/tests if Actions fail to start; no merge until all exact HEAD gates SUCCESS and conflict free. A disposable separate folder was used for such validation, without touching production files.
- Pending all-seven internal closure: scheduled outbox processing and governed admin reconciliation; paid renewal/plan changes/cancel with exact effective periods; live Core policy revocation/epoch fencing across in-flight requests; provider/model/attempt official FinOps and audio counters; unsigned-provider evidence adapters; WhatsApp multiworker chaos/recovery; end-to-end failure/rollback/security independent review. No `BUILD_COMPLETE_INTERNAL_GREEN`, deploy, real credentials, external homologation or production migrations.
