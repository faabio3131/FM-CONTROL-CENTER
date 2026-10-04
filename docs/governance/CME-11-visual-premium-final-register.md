# CME-11 — Visual Premium Final

**Projeto:** FM Command
**Repositório:** `faabio3131/FM-CONTROL-CENTER`
**Baseline:** `main@f6a9a287b8eb7d82ea5ad2daf5dbeecce3617ce7`
**Branch:** `feat/fm-command-cme11-visual-premium-final`
**Status:** IMPLEMENTED_PENDING_CERTIFICATION

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
LINT = PENDING
TYPECHECK = PENDING
UNIT_INTEGRATION_TESTS = PENDING
CME_11_VISUAL_CONTRACT = PENDING
BUILD = PENDING
BROWSER_E2E = PENDING
SECRET_SCAN = PENDING
DEPENDENCY_AUDIT = PENDING
PREVIEW_EXACT_SHA = PENDING
POST_MERGE = PENDING

CME_11_FINAL = PENDING
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
