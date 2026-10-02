# FM Command — Runtime Integration Status

Data: 2026-10-01

## Preview CURRENT
Base: https://fmcc-preview-web.onrender.com
- /api/version = 200, main@f7535423d38751bbc38f6d7e5e6013a485bfcf0e
- /api/health = 200, status=ok
- /api/ready = 200, status=ready

## Governed Alert Automation
O workflow agendado mais recente observado concluiu com workflow SUCCESS, porém a etapa "Evaluate governed alert rules" foi SKIPPED.
Nenhuma Actions Variable ou Secret de repositório foi listada para FMCC_AUTOMATION_BASE_URL ou FMCC_ALERT_AUTOMATION_SCHEDULER_SECRET.
Classificação: EXTERNAL_BLOCKED / RUNTIME_SECRET_REQUIRED.
Nenhum segredo foi inventado, impresso ou rotacionado.

## Kordena
A implementação, contratos e testes KCA-12/KCA-13 permanecem presentes. A leitura Web foi corrigida para depender de commercial:read sem expor a listagem administrativa do Source Registry.
A revalidação do banco/runtime real do control tenant não foi concluída por ausência de uma conexão Render workspace confirmada nesta execução.
Classificação de runtime real: EXTERNAL_BLOCKED até revalidação do source, health, sync, facts e observabilidade no ambiente autorizado.

## Demais fontes
O CURRENT documental de integração classifica várias fontes como READY_TO_CONNECT, PROVIDER_UNDECIDED ou SEMANTICS_PENDING. Não foi promovida nenhuma para CONNECTED sem health + sync + provenance + fatos reais.
