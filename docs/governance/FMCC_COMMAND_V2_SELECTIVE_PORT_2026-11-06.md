# FM Command interno — port seletivo de duas melhorias V2 (2026-11-06)

## Autoridade e escopo
- Destino: `faabio3131/FM-CONTROL-CENTER`, branch `feat/command-v2-insights-live-20261106` sobre `main@0653b7dd82a497ceb654de2b9201b8bc59ce086e`.
- Origem somente-leitura: `faabio3131/fm-command-v2@b47d3fdc7ba6f9bb5239368ac186a82d36df2bac`.
- **Exatamente duas melhorias**: gráficos analíticos e Live Pulse. Não copiar subscrição SaaS-V2, billing, ERPs, idioma, agentes, relatórios ou automações.
- A autoridade comercial, assinatura, tenant, produto e métricas permanece no FM Command atual.
- Nenhuma migration, mudança de dados, credencial, gateway ou deploy; `fm-command-v2` intacto.

## 1. Gráficos
- Componente declarativo `src/app/dashboard/charts/bar-chart.tsx` portado e adaptado do V2.
- Home: saúde por status e ocorrências de alertas **ativos** por severidade, no recorte de até 50 últimas ocorrências que o serviço já fornece.
- Formulário atual de comparação de produtos: adiciona gráfico **somente quando** o serviço canônico responde `comparable`; valida numerais finitos, não negativos, unidade e moeda coincidentes. Texto original do dado continua visível.
- Ausência de observação de serviços = `Indisponível`, não zero. Zero aparece apenas se fonte observada retornou 0.
- Sem mudança em `MetricService`, `ProductIntelligenceService`, `ProductRegistryService` ou contratos financeiros.

## 2. Live Pulse
- `GET /api/live/pulse`: sessão via `resolveTenantContext`, permissão `metric:read`, `Cache-Control: private, no-store`, resposta somente `{token}`.
- Repositório consulta **apenas** `metricValues` do `tenantId` autenticado. `auditEvents` só é consultado se o papel tiver `audit:read`. Token SHA-256 truncado de dados de mudança + identidade do tenant; nenhum valor financeiro, timestamp ou identificador de cliente é devolvido.
- Montado exclusivamente na home executiva atual; primeiro token não provoca `router.refresh()`. Só refresca quando muda. Pausa em aba oculta, para em 401/403 e aplica backoff até 60 s em erros temporários.
- Leitura sem migrations: usa índices e tabelas atuais. Não faz reprocessamento de métricas nem chamadas de IA.
- Limitação operacional: token captura inserções de métricas e eventos de auditoria. Alterações fora dessas fontes exigem ingestão no motor canônico; a frequência inicial é 5 s por home visível.

## Gates e governança
- TypeScript e lint do port verificados localmente; lint reporta warnings legados e zero errors.
- Testes novos cobrem ausência vs. zero, coerência de currency/unit, comparação por produto, token opaco por tenant, isolamento de permissões de auditoria, primeira leitura, backoff e atualização condicional.
- `AGENTS.md` requer revisão independente quando a alteração tocar segurança ou isolamento. Assim, a PR permanece **Draft** até os gates e review específicos.
- Em 2026-11-06, o gate F21 da PR ficou vermelho **na auditoria de dependências**, após os steps de isolamento e segurança passarem. `npm audit --omit=dev --audit-level=high` apontou `better-auth` existente em versão 1.7.5 e `@better-auth/drizzle-adapter` 1.7.5, com avisos (incluindo GHSA-965c-763c-88jm crítico) corrigidos em versão `>=1.7.7`. Atualização desses pacotes não integra esta PR de duas funcionalidades; exige alteração de segurança separada e testes de autenticação. Não ignorar a falha nem declarar o gate verde.
- No commit base, `package.json` já travava as dependências afetadas. Os componentes deste port não introduziram nem alteraram essas versões.

## Pendências antes de merge e publicação
1. Consolidar o resultado dos testes da suíte completa, build e CI no SHA final.
2. Revisão independente de segurança e UI do novo endpoint.
3. Tratar gate de dependências conforme fluxo de correção próprio (sem desabilitar audit).
4. Merge `main` somente após gates verdes, autorização aplicável e sincronização; deploy Contabo exige autorização específica.
