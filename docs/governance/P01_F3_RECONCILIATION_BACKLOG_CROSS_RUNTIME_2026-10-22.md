# VendeAtendeIA Prompt 01/04 — F3 reconciliation backlog cross-runtime gate

Data: 22/10/2026. Linha do Core consolidada após PR #7: `f09a552feb7e1115b9a91312f8de72e46d27f260`. Assistant candidato: `46eff847208fe64379ddc9187962b3ec92157ead`. Não atualizar os pins sem CI em SHA exato.

Esta PR atualiza o Foundation do Command para validar o Core realmente integrado e agrega os testes do endpoint somente leitura `/v1/admin/ai/usage/pending`, protegidos pela chave operadora, com banco descartável. Preserva a jornada assinada de licença, suspensão, reativação, áudio+texto, quotas compartilhadas, FinOps e os demais testes existentes de Command.

**Declaração de escopo:** este gate atesta que a reconciliação de pendências é *consultável*, não que recibos dos fornecedores de IA estejam homologados, nem que as faturas externas tenham sido reconciliadas, nem que todos os casos de compensação comercial foram efetivamente reparados. A API técnica não está conectada a uma tela pública do cliente. F3/P01 global continua em revisão de gaps; Core e Assistant PR #1 continuam Draft. Nenhum deploy, credencial real ou migração externa foi habilitado.

Gate de aceite: CI da PR (Foundation, Cognitive, Readiness), revisão de diff/código, merge com SHA exato elegível e os quatro checks de Command `main` verdes pós-merge. Rollback: revert da PR, sem alteração das linhas de dados.
