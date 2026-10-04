# CME-10 — Kordena e Scheduler de Alertas — Registro de Homologação Runtime

**Data:** 04/10/2026
**Baseline main:** `0cffb09353c39d706c6f22e8559aea8e4fa4ae5e`
**Cronograma:** CME-10 — Kordena e Scheduler de Alertas

## Regra de verdade

Este documento separa:

- contrato/código certificado;
- configuração runtime;
- execução runtime comprovada;
- blocker externo.

Nenhum componente é promovido para `CONNECTED` ou `ACTIVE` apenas porque o código e os testes estão verdes.

## 1. Kordena — CURRENT interno

O CURRENT contém:

- source type `kordena-commercial-v1`;
- secretRef dedicado `env:FMCC_KORDENA_CONTROL_PLANE_TOKEN`;
- `FMCC_KORDENA_CONTROL_TENANT_ID`;
- `FMCC_KORDENA_ALLOWED_ORIGINS`;
- `FMCC_KORDENA_BASE_URL`;
- bootstrap opcional via `FMCC_KORDENA_RUNTIME_BOOTSTRAP`;
- verificação de startup via `FMCC_KORDENA_RUNTIME_BOOTSTRAP_VERIFY`;
- URL HTTPS obrigatória;
- origem allowlisted;
- token resolvido somente server-side;
- timeout com AbortController;
- retry governado para timeout, HTTP 429 e 5xx;
- snapshot contratual validado fail-closed;
- sync idempotente;
- canonical facts com deduplicação;
- provenance;
- health persistido;
- last successful sync;
- Audit Ledger para integração;
- RBAC/tenant scope;
- comandos comerciais em allowlist;
- step-up/aprovação/idempotência para ações governadas já implementadas no control plane.

## 2. Evidência histórica Kordena no Preview

O checkpoint externo anterior registra que o banco Preview possuía:

- um produto Kordena;
- uma source Kordena product-scoped;
- secret reference e base URL;
- uma sincronização concluída em 30/09/2026.

Isso é evidência histórica, não homologação atual.

A source permaneceu com status `configured`; portanto não foi promovida para `CONNECTED`.

## 3. Preview atual — blocker de exact SHA

Consulta pública do Preview em 04/10/2026:

```text
URL = https://fmcc-preview-web.onrender.com
/api/health = ok
/api/ready = ready
deployed SHA = ba82e70ccda0d106af22fafdffac3e4f986443ac
branch = main
expected main SHA = 0cffb09353c39d706c6f22e8559aea8e4fa4ae5e
```

O SHA implantado corresponde a 02/10/2026 e está atrasado em relação à `main` certificada.

O workflow `FMCC Preview Deployment Gate` foi disparado pelo merge CME-09 e está aguardando o exact SHA.

### Consequência

A homologação runtime do Kordena NÃO pode usar esse Preview antigo para declarar o CME-10 concluído.

Estado:

```text
KORDENA_CODE = PASS
KORDENA_RUNTIME_CURRENT_SHA = BLOCKED / PREVIEW_EXACT_SHA_REQUIRED
KORDENA_CREDENTIAL_STATE = PENDING_RUNTIME_INSPECTION
KORDENA_CONNECTED = NOT_PROVEN
```

## 4. Scheduler — CURRENT interno

O CURRENT contém:

- workflow `.github/workflows/fmcc-alert-automation.yml`;
- cron horário;
- `FMCC_AUTOMATION_BASE_URL`;
- `FMCC_ALERT_AUTOMATION_SCHEDULER_SECRET`;
- HTTPS obrigatório;
- scheduler secret mascarado no GitHub Actions;
- autenticação Bearer com comparação timing-safe;
- `Idempotency-Key`;
- `X-Correlation-ID`;
- retries do chamador;
- timeout do chamador;
- locks PostgreSQL;
- idempotência de run;
- duplicate protection;
- stale-run recovery após 10 minutos;
- retry após falha;
- avaliação somente de regras ativas;
- `unavailable` preservado sem ocorrência falsa;
- Audit Ledger para started/restarted/failed/completed;
- contadores de regras, ocorrências, unavailable, incompatible e failures.

## 5. Scheduler — evidência runtime real

Execução inspecionada:

```text
GitHub Actions run = 37201873446
workflow = FMCC Governed Alert Automation
workflow result = success
FMCC_AUTOMATION_BASE_URL = vazio
FMCC_ALERT_AUTOMATION_SCHEDULER_SECRET = vazio
Evaluate governed alert rules = não executado
```

O workflow terminou com sucesso apenas porque a validação trata configuração ausente como blocker governado.

Logo:

```text
SCHEDULER_CODE = PASS
SCHEDULER_AUTH_CONTRACT = PASS
SCHEDULER_RUNTIME = EXTERNAL_BLOCKED / RUNTIME_SECRET_REQUIRED
SCHEDULER_REAL_EVALUATION = NOT_EXECUTED
SCHEDULER_ACTIVE = FALSE
```

## 6. Testes internos CME-10

Bateria dirigida em 04/10/2026:

- scheduler route sem secret => 503;
- scheduler route secret incorreto => 401;
- scheduler route secret correto => execução autorizada com idempotency/correlation;
- AlertAutomationService;
- Kordena runtime bootstrap;
- Kordena connector;
- KCA-13 observability;
- Kordena retry 503/429.

Resultado: `24/24 PASS`.

O teste PostgreSQL existente também cobre:

- duplicate run;
- stale-run recovery;
- retry após falha;
- run concluído não reinicia.

## 7. Ação externa necessária

O conector Render listou um único workspace:

```text
My Workspace
```

A governança do conector exige confirmação humana do workspace antes de consultar ou alterar serviços.

Depois da confirmação, a sequência CME-10 é:

1. identificar `fmcc-preview-web` no workspace confirmado;
2. inspecionar configuração/deploy sem expor secrets;
3. colocar Preview no exact SHA certificado;
4. revalidar `/api/version`, health e readiness;
5. confirmar o estado das configurações Kordena;
6. revalidar source, health e sync reais;
7. confirmar canonical facts + provenance no banco;
8. validar métricas compatíveis sem promover as 8 semânticas pendentes;
9. configurar scheduler base URL + secret somente se ausentes e no ambiente correto;
10. disparar execução controlada;
11. provar autenticação, idempotência, logs, alertas gerados e audit trail.

## 8. Gate provisório CME-10

```text
INTERNAL_CONTRACTS = PASS
INTERNAL_TESTS = PASS
PREVIEW_EXACT_SHA = BLOCKED
KORDENA_RUNTIME = PENDING_EXTERNAL_HOMOLOGATION
SCHEDULER_RUNTIME = EXTERNAL_BLOCKED / RUNTIME_SECRET_REQUIRED
FALSE_CONNECTED_CLAIMS = 0
CME_10_FINAL = HOLD
```

CME-11 não deve iniciar enquanto o CME-10 não estiver homologado ou formalmente encerrado com blockers externos conforme o Cronograma Mestre.
