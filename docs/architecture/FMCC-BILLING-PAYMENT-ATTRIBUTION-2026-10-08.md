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


## Etapa de configuração de gateways (08/10/2026)

A fundação `gateway-configuration.ts` implementa validação de configuração por tenant,
exigência de permissão `billing:write`, referência a segredo (não chave em claro),
código de provedor extensível e leitura filtrada por tenant que não devolve `credentialRef`.
A estrutura de banco proposta inclui `fmcc_billing_gateway_account` por tenant.

**Não habilitar** endpoints GET/POST para cadastramento em produção enquanto faltarem:
migração oficial com constraints e RLS, repositório transacional, autorização server-side,
secret vault, registro de adaptadores homologados, proteção de egress, política de webhook,
auditoria, UI administrativa, testes reais de isolamento de tenants e credenciais.

A ativação exige homologação de provider individual. GET/POST arbitrários fornecidos
por assinantes não podem virar requisições irrestritas no backend.

Observação: os testes unitários e os workflows da branch validam somente os componentes
que já estão efetivamente conectados; não provam persistência, interface ou cobranças reais.
