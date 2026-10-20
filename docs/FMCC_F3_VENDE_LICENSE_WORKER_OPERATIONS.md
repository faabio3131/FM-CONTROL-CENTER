# F3 / C04 — Worker governado e supervisão de licenças VendeAtendeIA

Status: **construção interna candidata**. Esta documentação não autoriza produção, alteração de segredos, publicação, integração com provider real ou execução de migrações operacionais.

## Fontes de verdade
- O pagamento só é canônico após conciliação pelo Billing do Command; o outbox nasce na mesma transação de confirmação e referencia fatura, produto, cliente, assinatura, tenant e revisão de plano.
- A licença efetiva pertence ao Assistant, com quotas aplicadas no Core; o worker nunca transforma webhook diretamente em licença.
- O `fmcc_billing_vende_license_outbox` é a fila durável, com estados `pending → processing → delivered|blocked`. Uma entrega incerta fica `blocked`, jamais volta sozinha para `pending`.
- `claim_token` é único por tentativa e usado como nonce do bind assinado. `binding-status` é uma consulta somente leitura de auditoria remota vinculada ao mesmo nonce.

## Acionamento operacional preparado (OFF por padrão)
- Implementação de um único lote: `runGovernedVendeLicenseWorker`, até **20** itens por chamada. Primeiro coloca claims antigas em quarentena; depois tenta despachar apenas pendências com `attempts=0` e, por último, calcula a saúde da fila. Não existe loop automático no processo web.
- Endpoint para scheduler: `POST /api/internal/workers/vende-license-outbox`, **sem corpo** e sem aceitar tenant, limite, URL ou provedor do chamador. Exige `Authorization: Bearer <token>` e comparação em tempo constante; lote fixo de 10. O token tem no mínimo 40 caracteres e fica somente no gerenciador de segredos da infraestrutura.
- O scheduler externo, sua frequência, isolamento de rede, controle de acesso, rate limit, guarda de logs e segregação de segredo exigem aprovação/configuração no gate de operação. **Nenhum scheduler nem credencial é criado nesta PR.**
- Chave de habilitação: `FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED` deve ser explicitamente `true` no ambiente aprovado. Ausente ou diferente de `true` recusa todas as execuções. `FM_COMMAND_VENDE_LICENSE_WORKER_TOKEN` é independente das chaves HMAC de conexão com Assistant/Core. Configuração de origem HTTPS e chave HMAC do Assistant continua em `planProjectionConfigFromEnvironment`.
- Cada acionamento exige pré-auditoria persistente em `fmcc_billing_audit_event` antes de qualquer envio. A auditoria de conclusão registra a mesma correlação; falhas posteriores não autorizam reenvio. O chamador nunca recebe credenciais ou detalhes internos de erro.
- A UI do Command permite ao FM owner/admin executar um lote com senha da própria conta somente após a chave de habilitação estar ativa. Essa ação também é pré-auditada e limitada a 20. **Não é um botão para ligar o worker em produção.**

## Supervisão e recuperação
- Área autorizada: painel do produto `vendeatendeia` → planos e franquias → supervisão da fila.
- `GET /api/billing/vende-license-outbox`: autenticação corporativa, contagens de **todas** as linhas do tenant FM, 50 itens recentes não concluídos para operação. Evita cache. Retorna `pending`, `processing`, `blocked`, `delivered`, `staleProcessing`, idade da primeira pendência e nível de alerta.
- Critérios: `critical` quando há bloqueio ou claim antigo; `attention` quando há processamento em andamento ou pendência há mais de 300 segundos; sem condições anteriores = `healthy`. São indicadores de fila, não provas de entrega/saúde do provedor.
- Reconciliação humana: POST `action=reconcile` exige FM role owner/admin, senha recente mesma conta, UUID de outbox existente e pré-auditoria fail-closed. Não executa `/bind`; somente consulta status assinado e aceita `bound_confirmed` vinculado ao nonce e ao plano. O Command revalida transacionalmente fatura, pagamento e plano antes do update de entrega.
- `still_blocked` **não significa que a licença não foi entregue**: é ausência de prova suficiente. É proibido retry cego ou limpeza manual de flags para contornar a reconciliação.
- Concorrência de trabalhadores: a tentativa muda de `pending` para `processing` com CAS e `attempts=0` sob transação. Disparos concorrentes não devem transmitir duas vezes a mesma licença; testes PostgreSQL cobrem esta propriedade, mas não representam atomicidade distribuída com Assistant.
- A classificação `blocked` retornada pelo contador sintético de `drain` também agrega falhas de claim; para condição persistida use SEMPRE `health.blocked`.

## Gates e autorização
1. Executar lint, typecheck, unit, PostgreSQL efêmero, cruzamento Node↔Assistant, segurança F21, build, browser E2E, container e auditoria de dependências no HEAD exato.
2. Revisão independente de segurança deve examinar scheduler auth, auditoria, riscos de concorrência, reversões entre commit/HTTP, revogação no Core, rate limit e operação sob múltiplas instâncias.
3. Fluxos de renovação/cancelamento, vigência, revogação, FinOps e recuperação humana de unknown ainda são unidades de construção internas separadas.
4. Só após BUILD_COMPLETE_INTERNAL_GREEN, revisão e autorização específica, planejar a configuração externa/segredo real/ACL/agendamento e publicar. Nenhuma env var real, cron externo ou produção nesta unidade.

## Rollback
Desabilitar a chave `FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED` no ambiente autorizado. O desligamento impede novas tentativas, preserva as entregas já registradas e não recoloca entregas incertas em pendentes. Se houver task em processamento interrompida, a rotina controlada de quarentena e a reconciliação humana posterior preservam sua evidência.
