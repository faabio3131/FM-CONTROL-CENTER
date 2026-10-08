# Billing Central — Attribution & segregation gate

Status: **fundação isolada, sem integração operacional nem autorização de produção**.

O pagamento de uma assinatura exige correspondência determinística de:
`billing_tenant_id` (empresa recebedora), `product_code`, `customer_id`,
`subscription_id`, `invoice_id`, `gateway_account_id`, `provider` e `external_payment_id`.
O SaaS operacional mantém seu `saas_tenant_id` em um mapeamento próprio com
a licença canônica; e-mail ou nome não determinam titularidade.

A notificação do provedor é apenas um indício até autenticação, consulta de confirmação e
conciliação com conta recebedora, referência externa, valor e moeda. Um desencontro
vai para quarentena e auditoria; nunca ativa uma licença.

**Dois domínios isolados:** a operação de assinaturas que a FM cobra por seus SaaS
fica no tenant financeiro da FM; operações do adquirente de uma licença do
Command ficam no tenant financeiro deste adquirente, com suas próprias contas
recebedoras e credenciais por referência. O produto Command deve cobrar sua
própria licença na operação financeira da FM, não na operação do adquirente.

Próximos gates: constraints de chaves compostas por tenant no PostgreSQL;
gateway-account registry por tenant, produto e ambiente; imports não cobrantes;
banco transacional, RLS e auditoria; invoice/payment-ledger/outbox; idempotência;
testes de concorrência, estorno e múltiplos provedores; webhooks reais sob
política de egress/SSRF; conciliação independente; APIs autenticadas de licenças;
certificação de sandbox e aprovação antes de qualquer virada de autoridade.
