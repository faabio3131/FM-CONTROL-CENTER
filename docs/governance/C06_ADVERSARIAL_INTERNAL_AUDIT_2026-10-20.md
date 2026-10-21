# C06 — Auditoria adversarial interna e reconciliação de prontidão

Data: 2026-10-20. PR auditada: #123, base `ee818f67af11f7e227680a016c7f7e1252d06acf`. Candidata ampliada: #124, branch `feat/c06-vende-lifecycle-audit-and-transitions-20261020`.

**Classificação: AUDITORIA INTERNA DO EXECUTOR; NÃO SUBSTITUI REVISÃO INDEPENDENTE DE QA/SEGURANÇA.** Não constitui autorização de merge, deploy ou homologação externa.

## Controles auditados / com prova automatizada

1. Tenant/org/product: `requireFMPlanAuthority` com owner/admin e `commercial:write`, sessão corporativa e step-up da própria conta <=300s. Rotas não aceitam cabeçalho ou JSON de tenant, gateway status ou URL do Assistant.
2. Cronologia do atraso: 5 dias **corridos** após vencimento D0 e no mínimo 3 dias **úteis COMPLETOS** conforme calendário FM revisado, sempre no timezone America/Sao_Paulo. Calendário ausente/incompleto ou PSP não verificado impede suspensão.
3. Datas: `dueDate`, `paidThrough`, `effectiveFrom` pertencem a tabela contratual Vende e não são inferidos de `invoice.createdAt`. Data civil ISO sem fuso implícito; migration 0015 aditiva e esquema histórico do Command preservado.
4. PostgreSQL: `tenantId+subscriptionId`, revisão esperada, lock de linha, idempotência por operationId, auditoria e outbox em mesma transação. Cancelamento `autoRenew=false` guarda o prazo pago; regularização não reutiliza conta cancelada e aguarda confirmação remota.
5. Fila: status `pending` ou `reactivation_pending` não é licença operacional; nunca exibir como sucesso. Dispatcher comercial de **SUSPEND_DELINQUENCY** segue no máximo um envio. Timeout/erro da rede fica `unknown`, sem reenviar por conta própria; leitura assinada do Assistant compara `command_request_id` real e estado antes de resolver. O ACK remoto ainda depende de revalidação transacional da fatura e da prova `unpaid_verified` recente; reversão durante I/O nunca vira `delivered`.
6. Assinatura: contrato comercial usa caminho HMAC exclusivo `/internal/v1/command/assistant-plans/commercial-transition`, diferente de `security-hold`. Receiver Python valida corpo, origem corporativa, timestamp, nonce e estado/plano/vigência esperados; append-only audit e mudança da licença são atômicos, com anti-replay mesmo se novo nonce tenta reutilizar operationId. Consulta remota `commercial-status` é somente leitura.
7. Consumo: licenças `suspended` e `cancelled` são negadas pelo resolver do Assistant; Core não deve receber novos grants para essas licenças.

## Achados que NÃO devem ser mascarados como “homologação externa”

- **AUD-C06-01 — PENDENTE INTERNO (alto): produtor autenticado de `fmcc_vende_payment_attestation`.** A tabela guarda a observação do PSP, mas o worker readback financeiro e sua fonte independente ainda não são construídos. Uma string manual `sourceRef` ou webhook isolado NÃO atesta PSP. O dispatcher exige observação recente, mas isso não certifica o produtor.
- **AUD-C06-02 — PENDENTE INTERNO (alto): dispatcher de `REACTIVATE_VERIFIED`, `RENEW_VERIFIED`, `APPLY_UPGRADE`, `APPLY_DOWNGRADE` e finalização de `SCHEDULE_CANCEL`.** Receptor Python HMAC preparado para as operações; Command apenas admite e executa parte delas. Faltam snapshots de preço/contrato, cálculo e aceite de prorrata, intenção com data/plano-alvo, confirmador de ACK e versionamento do período futuro.
- **AUD-C06-03 — PENDENTE INTERNO (alto): vigência/valor financeiro contratualmente vinculados.** `enrollPaidTerm` aceita datas inseridas sob autoridade FM, mas o schema canônico da fatura não contém período efetivamente adquirido. A revisão deve impedir prolongamento arbitrário de `paidThrough` e associar plano/revisão/preço/intervalo a prova de pagamento, antes de ativação.
- **AUD-C06-04 — PENDENTE INTERNO (médio/alto): prova verificável do aceite de cancelamento.** `customerConsentRef` atualmente é referência inserida por humano FM com step-up e audit, não um comprovante de aceite cryptograficamente vinculado a customer/tenant/assinatura/termos. Não oferecer cancelamento automático de cliente final antes do fluxo de consentimento.
- **AUD-C06-05 — PENDENTE INTERNO (alto): scheduler automático para D+5/3 úteis.** O ponto de entrada atual é FM manual com step-up; falta serviço identitário dedicado e execução autônoma com calendário/PSP verificados, além de avisos e recuperação. A regra de datas está implementada, mas a execução automática ainda não.
- **AUD-C06-06 — PENDENTE INTERNO (alto): lock e recuperação operacional de `processing` órfão.** Falhas após claim e antes do bloco try/catch ou morte de worker podem deixar `processing` até intervenção governada. Exigir leasing/observabilidade e política de reconciliação read-only antes do worker de produção.
- **AUD-C06-07 — PENDENTE DE GOVERNANÇA:** #120 (proteção contra estorno de licença paga) e #121 (security-hold distinto) são PRs concorrentes e devem ser reconciliadas/mergeadas em ordem compatível, sem apagar proteções ou usar bloqueio de segurança como inadimplência. #122 (política V1) tem arquivos de domínio idênticos copiados em #123/#124 — prevenir duplo merge e certificar diff resultante.
- **AUD-C06-08 — PENDENTE INDEPENDENTE:** nenhum revisor QA/segurança externo ao próprio executor registrou APPROVED nos HEADs auditados. Mesmo com CI 100% GREEN, **não** alegar “revisão independente concluída”. Solicitar revisão por responsável distinto segundo `AGENTS.md`.

## Fronteiras de confiança

- Command é autoridade de *cobrança e data contratual*; Assistant é autoridade local de licença/quotas; Core é executor IA. Banco da exchange/provedor/WhatsApp não define direitos do tenant.
- Signed Command assertions provam a autorização FM, não a assinatura nativa do gateway Asaas/OpenAI/Gemini.
- Nenhum segredo real, migração em banco permanente, deploy, cobrança, QR WhatsApp ou homologação externa nesta unidade.
- Risco de entrega remota aplicada apesar da reversão de pagamento depois de HTTP 200 exige recuperação governada/compensação independente; o candidato corretamente conserva `unknown` sem inventar revogação.
- Estornos, refunds, direito legal, preço, calendário e consentimento exigem fontes versionadas e auditáveis.

## Parecer provisório

**Candidata interna auditada em avanço, NÃO release completo e NÃO merge automaticamente autorizado.** Próxima promoção exige os workflows aplicáveis no SHA exato, resolução/aceite fundamentado dos achados bloqueantes e revisão independente registrada. Não usar simples conclusão de CI como prova de operação comercial integral.
