# VendeAtendeIA — B1.15 renovação governada por ACK assinado

O intento `RENEW_VERIFIED` B1.14 já possui o target imutável de pagamento,
preço, plano publicado, intervalo mensal/anual e vencimentos civis.
Esta unidade **não** duplica a admissão: recebe o comando pendente
previamente validado.

Reaprovação: FM owner/admin, commercial:write, senha/step-up pessoal
recente (até 300 s) e CAS do timestamp observado. Só permite `pending`
jamais reclamado/entregue e com target preexistente. A autoridade é
revalidada em TX com invoice pago, provider recebido, evidência
settled_verified canônica, produto/tenant/subscription/binding e termos
sem revisão divergente. Não produz extensão ou requisição externa.

Dispatcher privado, default OFF: `dispatchVendeRenewalOnce` reclama o comando
com lock. Faz readback S2S assinado por nonce, exige ainda não aplicada,
licença `active` ou `trial`, mesmo plano/revisão e vencimento remoto
igual a `previousValidUntil`. Revalida tudo depois do I/O e antes
do único POST assinado `RENEW_VERIFIED`. HTTP 2xx não é ACK: exige outra
leitura autenticada retornando `applied`, ação exata, status `active`,
plano/revisão e novo prazo exato. Somente então:
- incrementa revisão, paidThrough e dueDate locais na mesma transação;
- registra `fmcc_vende_contract_term_audit` com snapshots BEFORE/AFTER;
- marca o comando como `delivered`.

Erros, reversão financeira, leitura divergente e timeout colocam
`unknown`; não atualizam assinatura, quota, preço ou período.
Se o Assistant informar `applied` sem aprovação financeira local,
é criado um único evento de risco de compensação humana.
`reconcileUnknownVendeRenewal` consulta exclusivamente o status S2S,
inclusive após expiração do step-up, e nunca reenvia POST. Claims
`processing` abandonadas são isoladas como `unknown` sem replay.
Nenhuma compensação financeira é automaticamente executada.

Os testes usam PostgreSQL isolado e respostas HTTPS sintéticas do
Assistant: concorrência, CAS, step-up vencido, alvo congelado,
readback pré e pós, ACK exato, timeout depois de apply remoto,
reconciliação somente leitura, pagamento estornado, tenant divergente,
quarentena e imutabilidade no fracasso.

Sem nova migration ou PSP externo, sem cobrança, ativação de worker,
deploy ou homologação. Rollback: retirar serviço/painel novo, preservar
comandos e auditorias já criados; `unknown` nunca volta a `pending`.
B1/F3 e construção total continuam não concluídos.
