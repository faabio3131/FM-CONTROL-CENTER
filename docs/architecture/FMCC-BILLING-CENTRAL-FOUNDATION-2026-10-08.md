# FM Command — Billing Central, fundação de domínio (08/10/2026)

Status: **IMPLEMENTAÇÃO PARCIAL ISOLADA / NÃO OPERACIONAL**. Não habilitar cobrança, licenças ou produção a partir desta fundação.

## Auditoria de reuso

A arquitetura existente já prevê Integration Fabric, Source Registry, Canonical Facts, Metric Engine e separa faturamento de caixa recebido (ver `FMCC-12-CURRENT-DISCOVERY-FINANCE-v0.1.md`). O painel de billing existente controla remotamente recursos do **Kordena**; ele não é um ledger canônico de assinaturas FM. Não substituímos nenhum desses componentes.

## Autoridade aprovada

O Command centralizará pagamentos das assinaturas que os clientes pagam à **FM Tecnologia**, por adaptadores de gateway; o dinheiro será liquidado na conta da FM configurada no provedor. O Command não é o processador de pagamento nem administra os recebíveis dos consumidores finais dos estabelecimentos clientes.

O Command será fonte da verdade de `customer_id`, `subscription_id`, `license_id`, estados e política de carência. SaaS operacionais mantêm seus próprios tenants e aplicam licenças por eventos assinados + reconciliação a cada 15 minutos. Identificadores no contrato são UUIDv7 opacos, sem e-mail como chave.

## Preservação das vendas atuais

Cakto e Hotmart **continuam no AtendeVendeIA** até que os adaptadores equivalentes, conciliação, provisionamento via consulta API, proteção anti-duplicação e modo sombra tenham sido homologados no Command. Virada individual requer aprovação humana registrada e mecanismo de retorno seguro. Nunca duas autoridades simultâneas.

## Fundação desta branch

`src/domain/billing-central/license.ts` implementa validação de identidade, monotonicidade da versão, tratamento de eventos duplicados e cálculo fail-closed da contingência limitada a 72 horas, sem restabelecer licenças revogadas. Testes estão em `tests/billing-central-license.test.ts`.

**Não implementado nesta etapa:** tabelas/migrations, API, identificador UUIDv7 gerado pelo serviço, fila, recebimento de webhook de gateway, assinatura de webhook para produtos, persistência do ledger, conciliação financeira, autorização/escopo de integração, UI ou credenciais. Portanto não declarar o Billing Central pronto ou apto a cobrar.

## Gates antes de integrar e lançar

1. Schema e migração com isolamento tenant/product, transações e trilhas financeiras; geração real de UUIDv7.
2. Registro de produtos, planos, clientes, assinaturas, licenças e source-of-truth governada.
3. Provedores com segredo por referência, webhooks autenticados, idempotência e reconciliação independente do aviso de pagamento.
4. Outbox/fila para eventos assinados, retry, anti-replay e APIs autenticadas e escopadas para reconciliação/provisionamento.
5. Testes funcionais, de segurança, financeiras e falhas; shadow mode, migração governada e homologação com gateways reais.
6. Aprovação explícita para merge, deploy e ativação comercial.
