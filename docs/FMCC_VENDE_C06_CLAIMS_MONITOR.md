# VendeAtendeIA — B1.10 supervisão interna dos comandos comerciais

## Escopo
Projeta os comandos C06 já persistidos no FM Command para diagnóstico corporativo.
Fonte canônica: fmcc_vende_lifecycle_command, escopo tenant corporativo FM + produto
vendeatendeia ativo. Consulta READ-ONLY: sem endpoint POST, worker, job, gateway, provider
ou mutação de billing/licenças. Não confundir com o outbox de licenças pré-existente.
Indicadores de Command não comprovam estado de entitlement real no Assistant.

## Capacidade
GET /api/billing/products/{productId}/vende-commercial-claims exige identidade de
sessão FM e commercial:read (owner/admin). Não aceita parâmetro de tenant/action;
toda consulta é fechada por tenant e produto autorizados no servidor.

Contadores agregados consultam todas as linhas canônicas (pending, processing, unknown,
blocked, delivered), inclusive além dos 50 exemplos exibidos. A lista é limitada a
50, prioriza unknown, processing e blocked, com ordenação reprodutível. Truncamento
é sinalizado, jamais apresentado como total. Unknown não é prova de falha definitiva
nem autorização para reenvio. Processing há 15 min indica investigação, não
reprocessamento automático. Aprovações vencidas consideram somente ações
SUSPEND_DELINQUENCY/REACTIVATE_VERIFIED pending, sem claim/delivery.

Não há snapshots de pagamento/PSP, segredo, token, senha ou custo interno na projeção.
O painel oferece atualização manual, sem auto-poll que aumente carga ou gere atividade
não supervisionada. Usa no-store e erros sanitizados.

## Evidência / rollback
Testes: route auth, query rejection, resposta não autoritativa, sanitização;
PostgreSQL isolado para agregação de todas as linhas, estados/alertas, claims
antigas, escopo negativo e zero mutação. Lint, typecheck, build, regressão e CI
4/4 no HEAD da PR e após merge obrigatórios. Rollback: reverter API/leitor/UI,
sem descartar qualquer claim ou evidência existente. Sem migration ou deploy nesta
unidade. B1/F3/F9 e construção global permanecem em andamento.
