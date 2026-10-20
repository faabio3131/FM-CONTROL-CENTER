# FMCC C06 — Matriz de políticas e contratos para execução
Data: 2026-10-20 | Status: PENDÊNCIA de decisão comercial, contrato de engenharia em construção

## CURRENT verificado
- A assinatura FMCC registra tenant, produto, cliente, planCode, status e createdAt. Não guarda início/fim de vigência, prorrata, política de reembolso ou versão contratual efetiva.
- Invoice no FMCC é fatura, não caixa recebido; provider payment armazenado localmente depende da reconciliação externa para comprovar liquidação.
- #102 já registra intenção governada; #103 oferece recusa, não autorização financeira. O outbox IRON não é uma fila de execução de política geral.
- IRON #142 tinha caminho que emitia published_at nulo apesar da exigência do parser FMCC; PR #143 candidata corrige na origem com falha fechada.

## Contrato técnico v1 e autoridades
Versão fmcc.c06.execution-prerequisites.v1; o endpoint GET aplica identidade tenant do servidor e não aceita provas enviadas pelo cliente. Dados de prova devem referenciar tenant, produto, assinatura, ação, revisão, origem e validade temporal. O contrato sempre responde executionAuthorized=false.

| Ação | Pré-condições sem decisão aprovada |
| --- | --- |
| Cancelar | Política de vigência, reembolso, efeito na licença e confirmação |
| Suspender | Inadimplência conciliada, período de tolerância, aviso e estado da vertical |
| Reativar | Gateway conciliado, vigência e confirmação de licença |
| Renovar | Novo período, preço versionado, liquidação e confirmação no SaaS |
| Migrar plano | Versão PUBLISHED, prorrata, vigência e reconciliação |
| Converter trial | Coorte autoritativa, novo contrato, plano, liquidação e licença |

## Decisões materiais aguardando aprovação humana
1. Política mensal/anual e timezone: início, término e efeito de cancelamento.
2. Upgrade/downgrade e prorrata: preço efetivo, compensação, tributo, arredondamento.
3. Inadimplência: tolerância, aviso, suspensão e reativação.
4. Cancelamento: imediato/fim de ciclo e reembolso/chargeback.
5. Renovação: nova fatura, consentimento, período, idempotência e autorizações.
6. Trial: fonte de verdade, janela, coorte e evento de conversão.

Não foram criadas políticas padrão, taxas nem valores comerciais. Executor transacional depende de política aprovada, migration compatível para vigência, confirmação externa, outbox/ack e rollback. Não houve runtime homologado ou deploy.

## Ordem de integração
Certificar IRON PR #143 sobre #142 e revisar, preservar contratos de S2S. Depois reconciliar FMCC #104 e candidata C06 com revisão/gates. Toda execução financeira real continua bloqueada por política e provas ausentes.
