# FM Command — External Blockers

Data: 2026-10-01

1. EXTERNAL_BLOCKED / RUNTIME_SECRET_REQUIRED
   - Governed Alert Automation.
   - Ausentes no repositório: FMCC_AUTOMATION_BASE_URL e FMCC_ALERT_AUTOMATION_SCHEDULER_SECRET.
   - Efeito seguro: workflow valida configuração e pula avaliação real.

2. EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED
   - 8 executive metric targets permanecem pending_semantics.
   - Nenhuma fórmula foi inventada.

3. EXTERNAL_BLOCKED / PROVIDER_OR_CREDENTIAL_REQUIRED
   - Fontes financeiras, CRM, suporte, telemetria e demais providers sem autoridade/runtime real comprovado permanecem não conectados.
   - CONNECTED só pode ser declarado após source + runtime + health + sync + provenance + facts.

4. EXTERNAL_BLOCKED / RUNTIME_REVALIDATION_REQUIRED
   - Kordena possui arquitetura e evidências históricas de runtime, mas o control-tenant real não foi reconsultado nesta execução por falta de workspace Render explicitamente confirmado.

5. RELEASE BLOCKER — EXACT_SHA_PREVIEW_REQUIRED
   - O Preview CURRENT está em main@f7535423....
   - O candidate de correção deve ser homologado em Preview no SHA exato antes de certificação final.
