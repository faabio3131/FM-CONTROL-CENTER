# FMCC — Contrato Padrão de Integração Command ↔ SaaS (candidato)
Data: 2026-10-19 | Etapa: C00/C04 | Status: DESIGN CANDIDATO, requer reconciliação com APIs existentes e aprovação arquitetural antes de breaking changes.

## Objetivo
Novo SaaS FM deve conectar ao FMCC sem implementação bespoke de identidade, assinaturas, limites e telemetria a cada vez. Não criar serviço substituto para fontes canônicas nem imponer protocolo incompatível aos SaaS atuais.

## Responsabilidades
Command/FMCC: cadastro de produto, cliente comercial, billing, gateway, preço e configuração governada conforme contrato de cada produto; catálogo de capacidades, versões e consentimento; auditoria e consolidação de telemetria.
SaaS: identidades e unidades locais autorizadas, Core cognitivo vertical, catálogo local quando canônico (Kordena), entitlement efetivo, guard transacional quotas, métricas e eventos de uso; nunca depender de consulta Command para aprovar cada requisição.
Provider: fonte do pagamento/liquidação; reconciliação autenticada obrigatória.
Tenant Zero da FM usa mesmos contratos.

## Protocolo de referência (não endpoint implementado)
1. Onboard: handshake S2S autenticado associando product_id canônico, instalação, ambiente, tenant de origem e capabilities contratadas; não aceitar escopo derivado de header arbitrário.
2. Descoberta: contrato versionado de capacidades suportadas, health, esquema de métricas e operações de plano/entitlement; endpoints específicos por adapter. Compatibilidade semântica antes de ativar.
3. Configuração Command→SaaS: envelope com contract_version, command_id, correlation_id, product_id, target_tenant_id, policy_id, revision, effective_at, expires_at, payload_hash e assinatura vinculada ao path e método. Autorização determinística na origem e no destinatário; idempotência e anti-replay. Remover/renomear qualquer campo só via versão.
4. Aceite: estado received/applied/rejected/reconcile_required, applied_revision e prova de auditoria sem segredos. Outbox durável e inbox deduplicado. Falha/timeout não aciona retry cego; leitura de status autenticada e reconciliador governado.
5. Consumo SaaS→Command: eventos versionados com tenant, product, unidade autorizada, capability, plan_version, billing_cycle, quantity, unit, price_snapshot interno quando permitido, request/event id, occurred_at, hash e qualidade; diferenciar cobrança de telemetria, isolamento e ausência.
6. Ciclo comercial: Command recebe cobrança autoritativa, reconcilia gateway, registra transição contratual e envia nova revisão do entitlement; SaaS valida assinatura, tenant, versão e aplica snapshot local. Cancelamento/reembolso não dependem somente de webhook.
7. Observabilidade: health, source freshness, versão aplicada, divergência, DLQ, número de eventos pendentes, atrasos, e auditoria; nunca reportar dado inexistente como zero.

## Invariantes obrigatórios
- Reuse dos adaptadores existentes: KordenaCommercialControlService, Kordena Catalog Commands, IRON D11 outbox e FM Assistant Core Bridge. Não converter identidades Core↔Assistant em rota de políticas por acaso.
- Transport HTTPS e identidade de serviço por mTLS/HMAC/assinatura adequada ao threat-model existente, com rotação e segregação dos segredos; autorização e escopo no servidor, tempo de validade limitado e nonce.
- Políticas e tarifas versionadas; revisões monotônicas e comparadas atomicamente. Não reusar comando expirado nem confirmação com parâmetros alterados.
- Limites IA aplicados localmente e atomicamente pelo SaaS, reservas concorrentes, timeout preservando pendências, custo interno FM não exposto ao cliente.
- QR WhatsApp: regra vigente 45s de teto visual; min com expiração externa comprovada. Sincronização de alteração futura requer confirmação do Assistant e não altera QR já expirado.
- Métricas: registry com unidades, períodos, moeda, fórmula, fonte, qualidade, proveniência; Gateway e SaaS preservam autoridades e tenancy.
- Eventos críticos tem no mínimo cenários: replay, payload alterado, tenant trocado, version drift, timeout pós-commit, concorrência, secrets inválidos, receiver inoperante e reconciliação segura.
- Segurança: mínima permissão por produto+tenant+capability, audit trail, step-up FM para operação sensível; PII e segredos fora de payloads de telemetria.
- Cloud-first, interoperabilidade progressiva, sem API genérica de escrita que usurpe sistemas verticais.

## Interface requerida de cada SaaS (adapters, não reimplementação do domínio)
Conector identificado e autenticado; catálogo de capabilities e versão; controle de estado de licença e quotas; status/applied revision; ingestão de políticas; leitura de consumo/agregados e health; documentação OpenAPI/schema e testes contract fixtures. Cada SaaS pode adaptar APIs existentes sob mapeamentos aprovados.

## Interface requerida no Command
Registro canônico de produto/instalação/fonte; conta de serviço/escopos e secret refs; editor de política e contratos com preview/approvals; publisher com outbox/status/reconciliação; billing e ledger FM→cliente; Metric Registry e ingestão por adapters; visibilidade de divergências, logs e ações governadas.

## Estratégia de implantação
Fase 1 inventariar contratos Kordena, IRON e Assistant no SHA real.
Fase 2 congelar esquema v1 com exemplos de mensagens e matriz de compatibilidade; ADR após alternativas.
Fase 3 adapter Kordena no caminho existente, E2E auth/versão/negação sem preço real.
Fase 4 adapter IRON e Assistant com limites próprios; não transformar contrato de identidade #90 em settings.
Fase 5 testar onboarding de SaaS futuro em fixture isolada, sem credenciais reais.
Gates: testes de contrato multi-repo, integração, segurança/tenant, migrations descartáveis, CI, revisão independente e homologação real separada.

## Pendências de decisão
Forma única de autenticação serviço (avaliar contratos existentes); tenancy externa e IDs interoperáveis; nomenclatura Command/FMCC; semântica de reconciliação, versionamento de API e eventos; política de rollout/compatibilidade; assinatura digital versus HMAC e rotação. Nenhuma decisão muda serviços existentes automaticamente.
