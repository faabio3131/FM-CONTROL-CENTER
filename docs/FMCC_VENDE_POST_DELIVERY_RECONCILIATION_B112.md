# VendeAtendeIA — B1.12: reavaliação financeira pós-entrega

## Lacuna fechada nesta unidade
A B1.11 registra risco quando o Assistant reporta operação aplicada mas o
Command não confirma financeiramente durante o fechamento do comando. Isso não
detecta um estorno ou pagamento tardio que aparece **depois** de a operação
já estar registrada como delivered.

A B1.12 vincula essa detecção ao produtor **existente** de observações do PSP.
Somente uma consulta autenticada e configurada da FM, com binding canônico,
snapshot financeiro inalterado e resultado verificado, entra no ledger de
observações; a mesma transação identifica riscos de comandos C06 já delivered,
escopados à MESMA fatura/tenant.

Casos sinalizados:
- `REACTIVATE_VERIFIED` entregue e PSP retorna `reversed_verified` da fatura
  vinculada: possível acesso concedido após estorno; revisão humana.
- `SUSPEND_DELINQUENCY` entregue e PSP retorna `settled_verified` da fatura
  vinculada: possível suspensão após pagamento; revisão humana.

O sinal usa o evento append-only B1.11
`vende.compensation_review.required` e mantém a auditoria financeira existente.
A segunda leitura de observação e futuras verificações da mesma fatura não
duplicam alertas para o mesmo comando. Um GET/POST de reativação de licença
NUNCA é executado. A listagem corporativa mostra contagem HISTÓRICA (não
quantidade de casos ainda pendentes).

## Concorrência e disciplina transacional
O produtor PSP protege cada fatura com advisory lock e invoice lock;
a leitura de comandos delivered **não bloqueia a claim**. Não inverter
invoice -> claim FOR UPDATE em relação ao dispatcher claim -> invoice,
pois isso introduziria deadlock. Se uma entrega ainda não foi confirmada
durante o readback, o fence existente B1.11 deve reavaliar as provas ao
encerrar a operação. A emissão do novo alerta ocorre na mesma transação
que grava a evidência verificada.

Revisão financeira pós-entrega **não** confirma que a licença ainda
esteja suspensa/ativa no Assistant. Não equivale a reativar, suspender,
restituir, reembolsar, cancelar ou compensar. Reparo efetivo posterior
precisa de readback S2S de estado atual e autoridade humana específica.

## Restrições e validação
- O adaptador Asaas existente permanece OFF sem configuração FM explícita.
- Nada autoriza homologação real, segredos, produção ou deploy.
- Não altera invoice, pagamento, assinatura, entitlement, quotas ou taxas.
- Testes PostgreSQL descartáveis com respostas PSP sintéticas cobrem
  ambas as inversões, observação repetida, nova observação mesmo evento,
  estados incompatíveis, ausência de entrega e ausência de mutações.
- A supervisão existente B1.10/B1.11 é reaproveitada.
- Sem migration nova. Reverter hook/helper preservando o ledger e alertas
  anteriores; nunca apagar auditoria de casos já sinalizados.
- Todo WP exige 4 gates da PR e 4 pós-merge. B1 global ainda IN_PROGRESS.
