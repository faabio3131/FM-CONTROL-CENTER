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
