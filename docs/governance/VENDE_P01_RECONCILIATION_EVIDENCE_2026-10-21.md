# VendeAtendeIA — Prompt Mestre 01/04 — reconciliação por evidência

**Escopo de auditoria:** B1, F3 e infraestrutura F9. Auditoria de código
e de documentação dos três repositórios em 21/10/2026. Nenhum percentual
comercial de conclusão é inferido do número de PRs.

## Evidências atuais (não extrapolar a produção)

| Requisito | Estado de construção | Evidência / lacuna |
| --- | --- | --- |
| Command: billing e ciclo contratual (B1.1–B1.16) | CONCLUÍDO no nível dos WPs | Command main 7e4aad81392e5410adf24cdbd4cfc3804ea7fc30; PRs #134–142, 4/4 CI pré e pós merge de #142; não reconstruir |
| Command: outbox persistente de licença paga e worker | REUTILIZÁVEL | src/application/billing/assistant-paid-license-outbox.ts, vende-license-worker.ts, rotas worker; verificar contrato real ponta a ponta |
| Command: observações do PSP e divergência financeira | REUTILIZÁVEL | src/application/billing/vende-payment-readback-service.ts; vende-compensation-risk.ts; segurança contra replay já integrada |
| Command: investigação humana das divergências | ADAPTAR/IMPLEMENTAR | Novo review sem compensação automática neste candidato, com step-up FM, CAS e auditoria; reparo remoto comprovado ainda em aberto |
| Command: preços e quotas editáveis pela FM | REUTILIZÁVEL | assistant-plan-catalog-service.ts, plano versionado e telas existentes; exigir prova de publicação+vigência cross-repo |
| Assistant: Identity/RBAC/Tenant/License F1 | CONCLUÍDO em branch candidata | FM Assistant PR #1 Draft; F1 verde no tracker; ainda não houve integração global na main |
| Assistant: credential/integration control plane F2 | CONCLUÍDO em branch candidata | F2 verde; adaptações e credenciais externas devem permanecer desligadas |
| Assistant: receptor de transições comerciais | REUTILIZÁVEL | src/fm_assistant/commercial_license_transition.py e testes; comprovar compatibilidade exata de versão/escopo com Command |
| Assistant: quota view e consumo | REUTILIZÁVEL / ADAPTAR | plan_license_binding.py, plan_consumption_view.py, plan_consumption_dashboard.py; não considerar todo o fluxo F9 verde |
| Core: signed Assistant plan authority | REUTILIZÁVEL | core/ai_signed_plan_authority.py; grant fresco de no máximo 60 s; verifica HMAC e escopo; falha fechado |
| Core: guard/quotas no runtime | REUTILIZÁVEL / ADAPTAR | core/ai_plan_usage_guard.py, ai_quota_store.py, ai_control_plane_bootstrap.py; Settings.validate exige plan authority para staging/production; testes precisam provar todas as rotas e fallback |
| Core: medição e ledger FinOps | REUTILIZÁVEL / ADAPTAR | core/ai_usage_ledger.py, ai_finops_preflight.py e recibos; revisão financeira deve distinguir medição própria de prova externa |
| Core: reparação com recibo autenticado | REUTILIZÁVEL / ADAPTAR | ai_governed_recovery.py, ai_provider_source_verifier.py; provedores sem recibo assinado precisam de verificação própria sem inventar prova |
| Integração real de 3 serviços em bancos de teste | ADAPTAR / CERTIFICAR | testes F3 Command+Assistant+Core existentes; matrizes atuais não comprovam todos os cenários financeiros, consumo, revogação e fallback |
| Homologação PSP/Evolution/modelos e deploy | EXTERNO ADIADO | NÃO entra no GREEN_INTERNO e NÃO pode bloquear construção interna |

## Etapas internas restantes do Prompt 01

1. Fechar ciclo **seguro de resolução** de divergência com provas atuais de
   financeiro e estado remoto, aprovação humana e ação corretiva governada.
   O registro de investigação aqui entregue não declara o reparo executado.
2. Certificar projeção Command→Assistant→Core de licenças, limites e revogação
   no composition root. Reaproveitar os guards e assinaturas existentes.
3. Provar quotas, limites conservadores, fallback, retries e accounting por
   tentativa de texto e áudio no mesmo contrato, sem custo zero fictício.
4. Consolidar painel FM de custo técnico (interno), limites comerciais e
   recuperação de reservas com reconciliação canônica.
5. Executar testes cross-repo de jornada integral, concorrência, isolamentos,
   workers, downgrade/upgrade, expiração, indisponibilidade, replays e rollback,
   incluindo gates exatos nos HEADs finais de Command, Assistant e Core.
6. Fazer revisão de security/homologation boundary e apenas então decidir
   se Prompt_01_GREEN_INTERNO pode ser atribuído. Enquanto quaisquer destes
   itens permanecerem sem prova: estado P01=IN_PROGRESS.

## Regra de execução
Não adicionar novas funcionalidades ao escopo aprovado. Não recriar work
packages certificados. Não fazer merge de PR monolítica Draft do Assistant ou
Core apenas por seus testes atuais verdes. Respeitar review independente quando
obrigatória, branches protegidas, desligar auto-deploy e nunca usar segredos
reais, gateway, servidor Evolution, fornecedor IA ou bases de produção antes
do build completo. Para cada WP, preservar HEAD, testes, gate e rollback.
