# VendeAtendeIA — histórico de termos contratuais (B1.7/C06)

## Escopo e aceite
Responsável: executor autônomo, com autorização humana desta sessão. Autoridade:
FM Command para termos; SaaS para aplicação da licença. Capturar os termos anteriores
e posteriores de cada nova revisão aprovada, sem reconstruir condições históricas.
Integra B1 do cronograma existente; não encerra F3 ou o ciclo comercial.

Migration 0019 adiciona JSONB nullable à auditoria existente. Não executada em ambiente
operacional. Schema `fm.vende.contract-terms.v1`: before (null no primeiro cadastro),
after; identificadores tenant/produto/customer/assinatura/termo, revisão, início,
período pago, vencimento, autoRenew, estado, calendário, fonte, ator e timestamps.
Projeção explícita exclui segredos e corpos de provedores. Enrollment, cancelamento,
regularização e suspensão gravam snapshot na mesma transação do termo/outbox existente.
Não há API para editar auditoria. Mudanças posteriores no termo atual não a reescrevem.
Imutabilidade é garantida pelo fluxo da aplicação; este bloco não restringe administradores SQL.

## Leitura e segurança
GET vende-contract-history exige sessão e owner/admin corporativo FM, commercial:read,
produto Vende ativo e assinatura do mesmo tenant/produto. Cursor positivo beforeRevision,
100 registros por página, ordenação decrescente pela revisão única. Query com campos
adicionais ou duplicados é rejeitada; respostas no-store e erros sem detalhes internos.
Painel é somente leitura e consulta manual. Nenhuma chamada a PSP ou SaaS.
NULL legado é historical_snapshot_unavailable, nunca uma cópia fabricada do estado atual.
Snapshot registra intenção contratual; ACK de execução não cria revisão contratual.
Não constitui histórico de preços/quotas, confirmação remota ou prova de pagamento.

## Validação e rollback
Testes SQL existentes ampliados para os quatro escritores, concorrência, conservação do
histórico após mudança do atual, isolamento, paginação e legado. Testes de rota validam
query, sessão e sanitização. SQL e migrations executados somente no PostgreSQL descartável
do CI; gates completos exigidos no HEAD e main. Revisão em passe separado desta sessão,
sem alegar revisão externa. Reverter aplicação preservando coluna e dados; se escritores
antigos forem restaurados, suspender novas mutações até restabelecer captura. Não remover
coluna para rollback operacional. Nenhum deploy, segredo ou homologação externa realizado.
