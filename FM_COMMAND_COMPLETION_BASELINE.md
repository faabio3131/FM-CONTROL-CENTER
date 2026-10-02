# FM COMMAND COMPLETION BASELINE

Data: 2026-10-01
Produto: FM Command
Repositorio: faabio3131/FM-CONTROL-CENTER

## CURRENT congelado antes de alteracoes funcionais
- Branch de autoridade: main
- HEAD main: f7535423d38751bbc38f6d7e5e6013a485bfcf0e
- Working tree inicial: limpo
- Branch de execucao criada a partir do HEAD acima: fix/fm-command-completion-20261001
- PR aberta relevante: #32 (Draft), feat/command-premium-dashboard-20261001, HEAD 5e454188711661d18981f6e7d9f930ed6d71616a
- PR #32 permanece separada desta correcao funcional ate reconciliacao posterior.

## Preview atual
Base URL: https://fmcc-preview-web.onrender.com
- GET /api/version: 200; gitCommit=f7535423d38751bbc38f6d7e5e6013a485bfcf0e; gitBranch=main
- GET /api/health: 200; status=ok
- GET /api/ready: 200; status=ready

## Workflows presentes
- FMCC Foundation Gate
- FMCC F21 Operational Readiness Gate
- FMCC Preview Deployment Gate
- FMCC Cognitive Governed Gate
- FMCC Governed Alert Automation

## Gates observados no HEAD main
- Foundation Gate: SUCCESS no push do HEAD f7535423...
- F21 Operational Readiness Gate: SUCCESS no push do HEAD f7535423...
- Governed Alert Automation: workflow agendado conclui SUCCESS, mas a especificacao exige verificar se a etapa real de avaliacao executa ou permanece SKIPPED.
- Branch protection endpoint nao pode ser lido pela integracao GitHub atual (403 Resource not accessible by integration).
- Rulesets retornados pela API GitHub: nenhum.

## Banco/runtime
- Readiness do Preview esta verde.
- Auditoria de schema, migrations, contagens e integracoes reais ainda precisa ser executada nesta branch/candidate.
- Nenhum segredo sera impresso ou inferido.

## Findings internos trazidos pela auditoria
1. Kordena commercial:read bloqueado indiretamente por source:read na pagina Web.
2. Sidebar nao filtra itens por permissao.
3. /onboarding e Client Component sem barreira server-side explicita.
4. Scheduler precisa ser comprovado como executando a avaliacao real.
5. Oito metric targets permanecem pending_semantics e nao serao promovidos sem semantica formal.
6. Fontes/dados reais precisam de revalidacao.
7. Branch protection precisa de endurecimento se suportado.
8. PR #32 precisa de reconciliacao funcional e visual depois dos fixes internos.

Esta baseline foi registrada antes de qualquer alteracao funcional.
