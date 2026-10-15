# CURRENT — Reconciliação de evidências comerciais (2026-10-15)

Status: **AUDITORIA READ-ONLY; PAGAMENTO REAL A RECONCILIAR; NENHUMA PROMOÇÃO DE PRODUÇÃO**.

## Política de verdade e continuidade
Código/PR/CI/ambiente/banco/evidência de provedor atuais prevalecem sobre declarações de documento histórico. **Ausência de registro de homologação não prova ausência do teste**, assim como existência de endpoint ou teste unitário não prova homologação externa. Não reexecutar cobranças reais para suprir documentação ausente.

## Evidências verificadas em 15/10/2026
- FM Command (repositório `faabio3131/FM-CONTROL-CENTER`): fonte de IRON `iron-commercial-v1` com **5 fatos**, `healthy`; Kordena `kordena-commercial-v1` com **2 fatos**, `healthy`, no mesmo tenant comercial FM, em fontes separadas. Integridade do fluxo pull verificada anteriormente por operação/SQL, não constitui homologação de billing.
- Render PostgreSQL `fmcc-preview-postgres`: produto Kordena e IRON ativos; **0 planos comerciais**, **0 rotas produto→gateway**, **0 customer bindings** para cada um no tenant comercial auditado.
- Há **uma conta gateway Asaas production com status enabled**, secret reference `env://FMCC_ASAAS_PRODUCTION_API_KEY`. Status de linha não equivale a KYC/credencial/payment flow homologados.
- Fatura encontrada no tenant comercial: Kordena **BRL 1,00**, status `pending`, criada em 2026-10-09 03:23 UTC, **sem linha correspondente** em `fmcc_billing_provider_payment`. Não demonstrou pagamento Asaas liquidado nesse banco.
- Código `src/domain/billing/payment-attribution.ts` exige IDs canônicos tenant/produto/cliente/assinatura/fatura/gateway e rejeita alterações de vínculo por notificação do gateway.
- Commits de billing Asaas/IRON identificados: `f865e45b` (#77, conciliação read-only e outbox), `47aaf4ab` (#79, pagamento hospedado), `ffd3e17b` (#82, inbox autenticado), `9908fa7a` (#81, vínculo do pagador), `003b0aca` (#85, onboarding pagador). Estes provam implementação no histórico, **não pagamentos reais**.
- `docs/FMCC_PR63_CHECKOUT_RELEASE_GATE_2026-10-09.md` e `docs/FMCC_PIX_REAL_1BRL_PRODUCTION_GO_NO_GO.md` são checkpoints anteriores à execução e não podem ser usados para negar testes posteriores.
- Há relato do operador de testes reais anteriores com Asaas, Cakto e webhooks; a proveniência exata dos fluxos e passagem pelo Command não foi localizada nesta auditoria. Uma notificação de Pix externo de R$ 5,99 para CAKTO PAGAMENTOS LTDA em 2026-10-07 constitui evidência de envio à Cakto, **não** de conciliação do Command/Asaas nem de webhook recebido.

## Matriz de reconciliação
| Capacidade | Classificação | Próxima prova requerida |
| --- | --- | --- |
| Control plane comercial IRON ↔ Command | COMPROVADO — leitura/sync | Preservar logs/SQL/correlation IDs |
| Fonte independente Kordena ↔ Command | COMPROVADO — leitura/sync | Preservar isolamento |
| Billing canônico, attribution e código Asaas IRON | IMPLEMENTADO — HOMOLOGAÇÃO NÃO INFERIDA | CI exato e E2E provider-bound |
| Checkout Pix Asaas do Kordena no Command | A RECONCILIAR | Asaas `pay_...`, environment, `externalReference`, fatura/recibo e reconciliação persistida; sem nova cobrança |
| Compra real Cakto R$ 5,99 | PAGAMENTO EXTERNO EVIDENCIADO; INTEGRAÇÃO A RECONCILIAR | Produto/evento/webhook/correspondência no sistema dono, sem expor PII |
| Rota IRON → mesma conta Asaas FM | PENDENTE REAL NESSE BANCO | Validar identidade da conta FM, permissões, route/plan mapping e gate financeiro |
| Ativação automática de licença com pagamento externo | A RECONCILIAR / NÃO CERTIFICADO | Provider GET, webhook durable, invoice paid, outbox e confirmação IRON, sem simulados |

## Gate de continuidade
Antes de considerar pagamento live homologado: inspecionar comprovante/ID financeiro real do provedor sem exibir dados pessoais; conferir logs e ambiente da execução, comparar `externalReference`, invoice e account IDs; classificar separadamente Cakto e Asaas, evitando confundir pagamento ao provedor com recebimento SaaS. Manter emissão, webhook workers e promoção para produção desativados até gates externos específicos.

## Observação de governança
Atualizar este checkpoint **em cada WP e após cada prova posterior**, com commit/PR/CI/ambiente/dados não sensíveis; não deixar documentos antigos como única fonte de CURRENT. O presente documento não altera configuração financeira, dados, credenciais nem migrações.
