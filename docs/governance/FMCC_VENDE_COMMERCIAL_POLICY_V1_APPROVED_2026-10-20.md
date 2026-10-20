# Decisão Comercial V1 — VendeAtendeIA (aprovada em 20/10/2026)

**Status: DECISÃO HUMANA APROVADA / REGRAS CODIFICADAS / EXECUTOR AINDA NÃO LIBERADO.**

Autoridade: FM Tecnologia via Command; consumo IA da FM com teto configurável por plano, mesmas funcionalidades disponíveis em todos os planos. Esta decisão complementa a ADR-015: os bloqueios anteriores por falta de **política comercial** são resolvidos no escopo VendeAtendeIA, mas **não** fornecem prova de pagamento, vigência, identidade de serviço, feriado, estado da licença nem permissão para executar mutações.

## Regras humanas aprovadas

1. **Inadimplência:** suspensão a partir do **5º dia CORRIDO após o vencimento**, e **NUNCA antes de transcorrerem três dias ÚTEIS completos**. D0 é a data de vencimento local; D1 é o dia seguinte; o dia útil #3 deve acabar antes da suspensão. Data mais cedo = `max(D0+5 dias corridos, dia posterior ao 3º dia útil)`, à meia-noite local `America/Sao_Paulo`. O calendário de feriados precisa de registro oficial verificado/versão pelo operador FM (incluindo jurisdição adequada e feriados aplicáveis). Não inventar feriados. Uma ausência de fonte de calendário, cobertura incompleta, divergência de relógio ou não confirmação de inadimplência por conciliador de gateway deve **BLOQUEAR** a suspensão, não permitir antecipação. Exemplo: vencimento sexta 23/10/2026 → 5º corrido quarta 28/10; 3º útil também quarta 28/10, então suspensão **quinta 29/10**; feriado de segunda 26/10 leva a **sexta 30/10**.
2. **Cancelamento voluntário:** parar a renovação futura com aceite verificável; manter direitos já pagos até a data final de vigência confirmada. Solicitação ≠ liquidação financeira ≠ revogação de licença.
3. **Cliente encerrou definitivamente e volta:** criar **novos IDs independentes de customer, tenant e assinatura** e novo contrato. O contrato encerrado e a prova histórica permanecem imutáveis; NÃO reativar o antigo, NÃO migrar licenças, saldo de tokens, créditos ou trial automaticamente. Sem novo trial grátis automático; regras de antifraude e retenção de histórico conforme LGPD continuam.
4. **Cliente apenas suspenso e paga:** reativar o **mesmo ID** apenas após pagamento efetivamente conciliado, revisão de eventuais chargebacks e confirmação da licença pelo SaaS.
5. **Upgrade:** imediato somente após aceite do valor proporcional e pagamento efetivamente conciliado. Preservar data de renovação vigente; o cálculo deverá ser determinístico, usar preços versionados e regras de arredondamento documentadas antes de cobrar. Sem confirmação, não mudar quotas.
6. **Downgrade:** aplicar na próxima renovação, preservando direitos e teto vigente até completar o período pago.
7. **Renovação:** automática apenas se permitida pelo contrato e consentimento válido, com plano/valor versionado e pagamento conciliado; eventos da vertical/entitlement requerem confirmação assinada.
8. **Reembolso:** respeitar obrigações legais e direito do consumidor quando aplicável; demais casos requerem autorização FM, prova de pagamento e reconciliação do gateway. Não presumir reembolso automático nem exclusão de direitos legais.
9. **Estorno/chargeback:** tratar conflito financeiro e eventual suspensão de segurança como **operações separadas**, com trilhas independentes; sem burn/exclusão de histórico nem cobrança duplicada.
10. **Todos os recursos do SaaS continuam disponíveis em todos os planos**, limitados apenas por quotas/tetos configuráveis por FM (tokens, IA, áudio, canais/volume conforme contrato). Ao atingir limite, bloquear SOMENTE novas operações que consumam recurso excedido, preservando acesso administrativo e humano que não dependa da quota. Não gerar excesso cobrado automaticamente. Preços novos e vigentes precisam de versionamento e comunicação/aceite quando necessário.

## Contratos internos entregues nesta unidade

- `src/domain/billing/vende-commercial-policy-v1.ts`: contrato `fm.vende.commercial.v1.2026-10-20`, cálculo de datas civis FM, calendário de feriados *explicitamente governado*, exigência do terceiro dia útil **concluído**, gate de inadimplência fail-closed usando prova autoritativa de não pagamento.
- `src/domain/billing/vende-contract-decisions-v1.ts`: decisões determinísticas cancelamento/renovação/upgrade/downgrade/regularização/retorno com ID novo/refund/chargeback; todos os retornos `executionAuthorized:false`, pois a concessão efetiva depende de autoridade e prova transacional real.
- `GET /api/billing/vende-commercial-policy` restrita FM owner/admin com billing:read, sem endpoints de mutação e sem enviar holiday/payment proofs do cliente. Interface de consulta, não botão de suspensão.
- `tests/vende-commercial-policy-v1.unit.test.ts`: bordas D5+3 dias úteis, feriado, calendário faltante, pagamento desconhecido/quitado, cancelamento e cliente que retorna, sem operação financeira.

## WPs internos ainda obrigatórios antes de DECLARAR F3/C06 100% CONSTRUÍDO

1. Fonte canônica de **datas contratuais e vencimentos**: o schema genérico `fmcc_billing_subscription` existente não tem coluna de início/fim do período nem vence_at; não inferir `dueDate` de `createdAt` da fatura. Criar modelo versionado/migration aditiva apropriado à vertical + reconciliação com o gateway, em branch/revisão própria, preservando IRON e Kordena.
2. Cadastro FM de calendário empresarial de feriados **por competência e jurisdição**, revisão, auditoria e cobertura obrigatória; sem calendário validado, agendamento de suspensão é bloqueado.
3. Executor transacional C06 com CAS de estado/revisão, chave idempotente, subledger/outbox, eventos de renovação/mudança de plano, origens financeiras verificadas, identidade FM/cargo/step-up quando aplicável, saga/ACK/recuperação read-only na vertical, proteção de concorrência e testes PostgreSQL. Política está aprovada, não significa executor autorizado.
4. Integração de suspensão/revogar/reativar no Assistant e Core conforme plano/lote, preservando cliente/tenant e gateway do tenant antigo como registros históricos. Evitar que nova conta reative entitlement e trial antigos.
5. Cálculo de **prorrata** com fórmula, moeda BRL, arredondamento, créditos/reembolso, cancelamento e política de descontos aprovados em contrato antes de operações financeiras reais; proteger consumidor sem presumir direito legal universal para B2B.
6. Revisão adversarial independente e CI no HEAD exato; testes internos de clocks, concorrência, feriados, retroatividade, chargeback e ID duplicado. O gate de deploy externo/Asaas/Evolution/provedores reais vem SOMENTE DEPOIS do software integral construído.

**STOP:** não disparar suspensão baseada em status de webhook, data local implícita, feriado inventado, argumento recebido do cliente ou resposta HTTP ambígua. Não alterar endpoints C06 existentes de *review/intent* para autorizar cobrança por esta decisão. Nenhum deploy, migration de produção, PSP real, segredo ou pagamento efetuado aqui.
