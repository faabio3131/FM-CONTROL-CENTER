# FMCC — CRONOGRAMA MESTRE DE EXECUÇÃO DOS SETE FLUXOS COMERCIAIS
Data 2026-10-19 | Status: plano de execução aprovado pelo usuário, **não evidência de implementação**.
Escopo: FM Control Center / painel FM Command; rollout por SaaS sem bifurcação. Subordinado ao Plano Mestre F00–F22 (não substitui nem reinicia fases já certificadas).

## Contexto e estado conhecido
- Main inspecionada inicialmente em 18f1d1b2c9283fd7f775da97e3b7a74e3c767ada. Revalidar em cada execução.
- Billing schema inclui product/customer/plan/customer binding/subscription/invoice/gateway/payment/events/audit; UI /dashboard/subscriptions exibe métricas governadas, NÃO operação integral.
- PR #90 (Command→Assistant identidades), #91 (Kordena editor preços/franquias), Kordena #230 (FinOps local), Assistant #1: Draft; existem gates e integrações pendentes. Nenhum destes se torna verde por este plano.
- IRON D11 possui emissão/reconciliação/outbox com flags OFF. Evidência de preview 2026-10-14 não é estado de produção em 2026-10-19. Revalidar antes de ações.
- QR 45s política aprovada; propagação Command→Assistant de futuras mudanças ainda não comprovada.
- Não migrar nem reescrever Billing, Identity, FinOps ou Core por preferência. Reconciliar autoridade atual antes de criar tabelas.

## Gate transversal por WP
Entrada: current comprovado (branch, SHA, PR, schema, contratos, fonte autoritativa), riscos, testes existentes; aceite escrito. Saída de CONSTRUÇÃO: código+API+UI+persistência+migration quando necessária+autorização+auditoria+observabilidade+testes negativos+CI interno executado/verde no SHA+dívida explícita. Saída INTEGRAÇÃO: contratos cross-repo e E2E autenticado em ambiente controlado, reconciliador comprovado. HOMOLOGAÇÃO EXTERNA e RELEASE são gates próprios F21/F22 e não condicionam conclusão das atividades internas independentes. Bloqueio externo explícito não vira PASS.

## WPs em ordem de dependência
| WP | Fluxo | Fases mestre relacionadas | Entregas e critério de aceite interno | Dependências |
|---|---|---|---|---|
| C00 | Preflight/canonização | F02,F04,F05,F06 | Inventário fonte de verdade e checkpoint atualizado; ADR de autoridades: FMCC vs SaaS vs gateway; matriz de segurança e IDs, revisão do legado, contratos versionados | início |
| C01 | 1: SaaS/planos/preços/limites | F07,F11,F12,F13 | CRUD governado produto e planos; versões imutáveis, BRL mensal/anual, política de migração, quotas por capability e teto; validações preview/publish/step-up; ausência de preço hardcoded; testes cross-product e rollback | C00; preservar PR #91 |
| C02 | 2: cliente/assinatura/ID | F13,F15,F06 | Cadastro e binding tenant/produto/cliente único; trial→paid; uma assinatura por vínculo contratado com estados e histórico, ações idempotentes, UI e APIs com RBAC e cross-tenant negatives | C01 |
| C03 | 3: gateway/cobrança | F07,F12,F13 | Router product→gateway account/ambiente; invoice/assinatura/payment referenciados; provider inbox autenticado, reconciliação GET, evento dedupe, ledger auditado, falha/estorno e retries seguros; sem cobrança real em testes | C02; reutilizar IRON D11 |
| C04 | 4: entrega de licença/configuração | F07,F14,F17 | Contrato Command→SaaS autenticado, versionado e auditado; outbox+ack, idempotência, replay protection, entrega assíncrona e status/reconciliação; nenhuma licença só por webhook | C01–C03; PR #90, Assistant #1 |
| C05 | 5: consumo/quota local | F11,F12,F14,F15 | SaaS faz enforcement backend, reserva concorrente/idempotente antes de consumir IA, custo real/snapshot e desconhecido, tenant/unidade/capability, alertas 70/90/100, visão de consumo sem expor margem/custo interno FM | C04; Kordena #230 |
| C06 | 6: lifecycle assinatura | F12,F13,F15,F17 | Renovar, migrar, cancelar, suspender inadimplência, refund e reativar com máquina de estados, effective dates, jobs idempotentes, reconciliação e trilha completa; sem cobrança duplicada | C02–C05 |
| C07 | 7: Command executive | F08,F10,F11,F12,F15,F16,F17 | Segmentação por tenant/produto/cliente/período; receita≠fatura≠caixa, MRR/ARR com semântica aprovada, custos IA/infra e qualidade/proveniência, consumo e saúde; fontes ausentes exibidas como indisponível | C02–C06 + Metric Registry |
| C08 | Integração de produtos | F07,F11,F14,F15,F19 | Certificar Kordena, IRON, Assistant/VendeAtendeIA em matriz isolada; cada SaaS conserva identidade e core vertical; onboarding de novo SaaS por contrato versionado, sem cópia de lógica financeira | C01–C07 |
| C09 | Fechamento e release gates | F18,F19,F20,F21,F22 | UX premium PT-BR; lint/types/build/testes SQL/API/E2E/segurança; revisão independente; documentação/runbooks/backup+restore+rollback; homologação externa separada e autorização de deploy/publicação | C00–C08 |

## Aceites obrigatórios adicionais
1. Nenhuma requisição autoriza produto/tenant por headers livres; identidade assinada determina escopo no servidor. Testes negativos de org, tenant, SaaS, unidade e capability.
2. Idempotência por chave+fingerprint e controles transacionais: duplicatas, concorrência, inversão de eventos, erro de rede após commit, retry, replay, estorno.
3. Versões imutáveis e data de vigência: mudança preço/política não altera contrato antigo automaticamente; política explícita de upgrade/downgrade/prorrata se aprovada.
4. Plano limita consumo e não remove funções por padrão; qualquer mudança exige decisão humana. Custo IA USD interno separado de preço comercial BRL, sem conversão tácita.
5. Quando config de QR publicada, max_display_seconds=45 até outra decisão: prazo efetivo=min(45, prazo externo verificável); Assistant não usa QR expirado; propagação futura exige ack autenticado; falha de sincronização aparece como pendência e mantém política segura.
6. Só reconhecer pagamento quando conciliado com provedor e contrato canônico. Não equiparar habilitação de conta Asaas, runner verde ou deploy a pagamento aprovado.
7. Métrica exige ID/versão/formula/unidade/moeda/período/timezone/dimensões/inclusões/exclusões/fonte/qualidade/proveniência. Ausência != zero, faturamento != receita reconhecida != caixa, custo desconhecido != zero.
8. Gestão FM Tenant Zero utiliza fluxos comuns; nenhuma operação de outro tenant fica visível à FM sem permissão administrativa comercial explicitamente autorizada pelo produto.
9. Monitoração: outbox pendente, sincronização atrasada, falhas de cobrança, consumo acima limite, divergência de licença, latência de fonte, auditoria e alertas.
10. Evidências arquivadas por WP: PR/commit, comandos+resultados de CI, ambientes, testes negativos, migrações, auditoria independente, gaps, rollback e next.

## Cadência / avanço
Executar WPs independentes em paralelo apenas com gates e isolamento de branches. Ao terminar cada WP, registrar estado em docs/governance/FMCC_COMMERCE_EXECUTION_CHECKPOINT.md e AGENTS.md se regras mudarem; avançar para o próximo WP desbloqueado sem solicitar autorização reiterada para codificar/corrigir. Merge pré-autorizado somente com todos gates obrigatórios GREEN comprovados no SHA, revisão e ausência de STOP. Caso contrário Draft, diagnóstico/correção/reteste; se bloqueio externo, seguir outro WP independente. Nenhum merge só porque GitHub apresenta mergeable=true. Credenciais reais, cobrança real, migrations operacionais, produção, publicação pública ou destruição dependem de autorização específica.

## Referências operacionais
PRs: https://github.com/faabio3131/FM-CONTROL-CENTER/pull/90 ; /pull/91 ; https://github.com/faabio3131/fm-ai-platform/pull/230 ; https://github.com/faabio3131/-FM-Assistant-Base/pull/1.
Arquivos do repo: src/infrastructure/db/billing-schema.ts; src/app/dashboard/subscriptions/page.tsx; docs/IRON_D11_OPERATIONAL_PREFLIGHT_2026-10-14.md. Documentos fundacionais do projeto e System Design continuam soberanos em seus escopos. Decisão posterior: Core cognitivo **vertical próprio** por SaaS; não copiar Core do Kordena.
