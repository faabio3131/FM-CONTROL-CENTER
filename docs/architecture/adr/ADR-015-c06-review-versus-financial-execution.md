# ADR-015 — C06: revisão administrativa não autoriza execução financeira
Data: 2026-10-20
Estado: candidata em construção, revisão/aceite pendentes
Referência: Plano Mestre F12/F13/F15/F17; Cronograma Comercial C06; PR #103.

## Contexto e autoridades
O FMCC registra vínculos e estados de assinatura. Apenas o provedor autorizado prova pagamentos externos, e a vertical SaaS confirma direitos efetivos. A PR #102 já armazena intenções de mudança em eventos de auditoria, sempre "awaiting_policy", sem autorização financeira.

Ainda não há política comercial aprovada de cancelamento efetivo, datas de vigência, tolerância, prorrata, restituição ou conversão de trial que permita transições genéricas em segurança.

## Decisão
Construir consulta administrativa e recusa terminal local de intenção, sem aprovar nem executar mudanças. Reutilizar a tabela "fmcc_audit_event" e seus contratos existentes:
- Solicitação original: "billing.lifecycle.intent_recorded";
- Recusa append-only: "billing.lifecycle.intent_review_rejected";
- Estado visível derivado: "awaiting_policy" ou "review_rejected".

Recusa é operação sobre solicitação administrativa, não altera o estado da assinatura, pagamento, fatura, vigência, licença ou outbox.

## Alternativas e consequências
1. Executar automaticamente quando operador clicar "aprovar": rejeitada por falta de autoridade/política verificável.
2. Criar tabela, serviço e fila de execução dedicados agora: rejeitada porque inventaria capacidade operacional sem contrato financeiro aprovado.
3. Permanecer apenas com prévia e pedido sem gestão: rejeitada; solicitações não teriam tratamento rastreável.
4. Reusar auditoria e permitir apenas recusa governada: selecionada como menor incremento íntegro.

O modelo de auditoria cresce com novos eventos e requer paginação, retenção e índices apropriados à escala em evolução; estes itens precisam de avaliação antes da disponibilização comercial.

## Invariantes e fluxo
Identidade assinada → RBAC owner/admin billing:write → listagem de até 50 com truncamento → recusa com motivo enumerado → confirmação e step-up por senha → idempotência composta por tenant/ator/chave → locks PostgreSQL de idempotência e intenção em ordem fixa → verificação tenant/intent e inexistência de decisão → evento imutável com auditoria → retorno executionAuthorized=false.

Erros transacionais fazem rollback; replay com a mesma chave/mesmo payload retorna decisão existente. Chave distinta em pedido já recusado falha. Query indisponível não significa fila vazia. Nenhuma resposta devolve hashes de tokens ou metadados brutos de auditoria.

## Gates
Unitários, negativa RBAC, tenant diferente, idempotência, concorrência real em PostgreSQL descartável, lint, tipos, build e revisão. Sem migrações novas. Não realizar merge/publicação/deploy fora dos gates/autorizações atuais.

## Próxima decisão material
Definir e aprovar políticas de vigência, reembolso, prorrata, período de tolerância e fontes de prova por SaaS. Só então desenhar e construir o executor transacional com revalidação, provas externas, command/outbox, ack, reconciliação, timeout, retry, auditoria e recuperação; não usar a recusa como permissão para executar.
