# CME-11 — Visual Premium Final

**Projeto:** FM Command
**Repositório:** `faabio3131/FM-CONTROL-CENTER`
**Baseline:** `main@f6a9a287b8eb7d82ea5ad2daf5dbeecce3617ce7`
**Branch:** `feat/fm-command-cme11-visual-premium-final`
**Status:** PRE_MERGE_CERTIFIED / POST_MERGE_PENDING

## Autoridade visual

A referência oficial é o dashboard premium aprovado pelo proprietário da FM Tecnologia.

A implementação deve preservar integralmente:

- autenticação;
- autorização e RBAC;
- tenancy;
- APIs e contratos;
- regras de negócio;
- autoridades determinísticas;
- integração Kordena;
- Core cognitivo;
- métricas e semântica;
- observabilidade;
- auditoria.

## Delta CME-11

- busca global governada exposta no topbar;
- identidade FM Tecnologia / COMMAND preservada;
- artwork oficial do FM Command Core aplicado ao painel cognitivo;
- Visão Geral recomposta com hierarquia executiva equivalente à referência;
- rail de Saúde Operacional, Status dos Serviços e Alertas;
- Activity Feed compactado em cards executivos;
- design system final reforçado para tabelas, estados, responsividade e densidade;
- nenhuma métrica conceitual do mock foi hardcoded;
- ausência de fonte continua sendo `Indisponível`, nunca zero presumido.

## Gates exigidos

```text
CANDIDATE_SHA = af6306c8f99e74258e0c32abf5f24c6b519b7b0f

FMCC_F21_READINESS_RUN = 37220269733 / SUCCESS
FMCC_FOUNDATION_RUN = 37220269639 / SUCCESS
FMCC_COGNITIVE_GOVERNED_RUN = 37220269645 / SUCCESS

LINT = PASS
TYPECHECK = PASS
UNIT_INTEGRATION_TESTS = PASS
CME_11_VISUAL_CONTRACT = PASS
BUILD = PASS
BROWSER_E2E = PASS
RUNTIME_SMOKE = PASS
DOCKER_BUILD_WITHOUT_RUNTIME_SECRETS = PASS
SECRET_SCAN = PASS
SECURITY_TENANCY_ADVERSARIAL = PASS
BACKUP_RESTORE_SMOKE = PASS
DEPENDENCY_AUDIT = PASS
DIFF_WHITESPACE = PASS

PROHIBITED_BACKEND_AUTH_RBAC_TENANCY_DELTA = 0
MOCK_NUMBERS_AS_REAL_DATA = 0
MISSING_TO_ZERO = 0

PREVIEW_EXACT_SHA = PENDING_POST_MERGE
POST_MERGE = PENDING

CME_11_PRE_MERGE = PASS
CME_11_FINAL = PENDING_POST_MERGE
```

## STOP conditions

- regressão funcional;
- rota quebrada;
- auth/RBAC/tenancy alterados;
- dado inexistente exibido como zero;
- número do mock usado como dado real;
- secret/PII exposto;
- preview em SHA diferente do certificado;
- gate crítico vermelho.
