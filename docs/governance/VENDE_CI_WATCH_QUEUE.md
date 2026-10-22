# VendeAtendeIA — CI Watch Queue (checkpoint de retorno)

Este arquivo é uma fila declarativa de conferência; **não** é um scheduler ativo. Atualizar quando iniciar ou consultar CI. Se o HEAD mudar, invalidar a certificação anterior.

| Repo | PR | HEAD | Run IDs / gates | Estado verificado | Poll attempt | Dependência / próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| FM-CONTROL-CENTER | #146 | `e6cb0abbc2bc921848531d1689a87358daeb6d47` | Foundation 39710241038; Billing PostgreSQL 39710241048; F21 39710241070 | GREEN 3/3 registrados em 21/10/2026; revisão independente ainda não comprovada | 1 | Conferir revisão independente e gates aplicáveis (inclusive Cognitive se exigido) antes de merge; pós-merge obrigatório |
| FM-CONTROL-CENTER | #147 | `cf094c750286702c196044557e1799b0d65da924` | Foundation 39712083224; F21 39712083237; Cognitive 39712083312 | IN_PROGRESS, conferido nesta retomada | 1 | Conferir CI HEAD, revisão aplicável, reconciliação com #146 e merge seguro |

## Protocolo de retorno

1. A cada tarefa independente concluída, consultar as execuções associadas ao **HEAD atual** de cada entrada pendente.
2. Registrar `lastCheckedAt`, run IDs, conclusão e incremento de tentativas no checkpoint antes de tomar decisão de merge.
3. RED: diagnosticar/corrigir e reiniciar gate; GREEN: revisar e integrar somente se todas as proteções forem atendidas; PENDING: continuar trabalho independente; BLOCKED_EXTERNAL: não inventar sucesso.
4. Não desenvolver etapas dependentes da integração das PRs em aberto.
5. Nenhuma entrada implica trabalho automático contínuo fora de um executor/agendador ativo.
