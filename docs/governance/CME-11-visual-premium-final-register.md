# CME-11 — Visual Premium Final

**Projeto:** FM Command
**Repositório:** `faabio3131/FM-CONTROL-CENTER`
**Baseline:** `main@f6a9a287b8eb7d82ea5ad2daf5dbeecce3617ce7`
**Branch:** `feat/fm-command-cme11-visual-premium-final`
**Status:** PRE_MERGE_CERTIFIED / POST_MERGE_CORRECTIONS_PENDING

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
- artwork aprovado do FM Command confirmado na tela de login e aplicado localmente ao painel cognitivo do dashboard usando a mesma autoridade `APPROVED_COMMAND_ARTWORK_SRC`; aguardando validação visual antes do deploy;
- Visão Geral recomposta com hierarquia executiva equivalente à referência;
- rail de Saúde Operacional, Status dos Serviços e Alertas;
- Activity Feed compactado em cards executivos;
- design system final reforçado para tabelas, estados, responsividade e densidade;
- nenhuma métrica conceitual do mock foi hardcoded;
- ausência de fonte continua sendo `Indisponível`, nunca zero presumido.

## Revisão visual pós-merge — pendências antes do deploy

- copy do hero do Core aprovada para `INTELIGÊNCIA COGNITIVA VERTICAL` e aplicada localmente;
- artwork do dashboard substituído localmente pelo mesmo asset oficial aprovado usado na tela de login; validação visual do proprietário ainda pendente;
- microtextos sobrepostos removidos localmente da composição do artwork; validação visual ainda pendente;
- compactação desktop aplicada localmente em Financeiro, Assinaturas, Clientes, Operações, Atividades e Alertas, reduzindo cabeçalhos, cards, gaps, painéis, filtros e controles;
- CME-11.2 aplicado localmente em Visão Geral + Notificações: em 1366×768 o header da Visão Geral caiu de 114px para 81px, os quatro cards executivos de 144px para 92px e o Core subiu de Y=386 para Y=269; Notificações passou de scrollHeight 1033/overflow 265px para scrollHeight 768/overflow 0 após compactação e scroll interno governado da sidebar;
- responsividade CME-11.2 validada sem overflow horizontal em 1440×900, 900×900 e 390×844;
- opção de voz registrada como pendência funcional: na prévia local o navegador retorna `Permissão do microfone não concedida.`; validar permissão do browser e fluxo de voz ponta a ponta antes do deploy;
- nenhuma destas correções está publicada no Render.

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
