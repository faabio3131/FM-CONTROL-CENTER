# VendeAtendeIA — B1.16: upgrade e downgrade governados por evidência

A FM controla os preços, planos e quotas. Todas as funcionalidades continuam
disponíveis; upgrade/downgrade altera apenas limites de consumo/valor e nunca
um menu de recursos habilitados. O tipo de transição é provado por dominância
estrita da quota publicada para as mesmas chaves (resource, scope, window):
um upgrade tem limites iguais/maiores (algum estritamente maior) e preço
publicado superior; downgrade exige limites iguais/menores (algum menor) e
preço inferior. Ciclos mensal/anual diferentes, quotas incomparáveis e preços
contraditórios são NEGADOS, sem prorrata ou desconto implícitos.

## Admissão pela FM (não entrega)
Apenas owner/admin FM com senha e step-up recente (<= 300 segundos) pode
admitir a intenção e consentimento audível. Vínculo tenant/produto/cliente,
contrato ativo e autorenew, assinatura billing ativa, revisão contratual
observada, invoice do MESMO cliente/subscription paga BRL, status PSP received,
última evidência reconciliada settled_verified, nenhum uso anterior
da invoice e publicação das duas revisões e preços FM concordantes são
obrigatórios. A invoice deve ser posterior ao registro do contrato.
Preço, quota, período e validade são derivados do catálogo FM, nunca
aceitos como valores arbitrários da API.

A operação APPLY_UPGRADE preserva paidThrough/dueDate da assinatura atual.
A operação APPLY_DOWNGRADE prepara um próximo ciclo pago completo, com
cobrança pelo preço do plano inferior, mas NÃO pode reduzir quotas antes
da fronteira exclusiva do dia local `paidThrough` em America/Sao_Paulo.
O target tipado JSONB inclui revisão/plano originais, anterior validUntil,
novo plano/revisão/preço/ciclo/validUntil, prazo e dueDate e paymentRef.
Uma mesma invoice não é utilizada por duas mudanças.

## Reaprovação e entrega
A interface FM lista apenas intents pending nunca reclamadas e step-ups
vencidos (downgrade devido somente após o dia pago completo).
A reaprovação exige senha de operador e CAS da última aprovação, preserva
integralmente o target e audita na mesma transação.

O dispatcher privado fica OFF por padrão. Reclama uma operação apenas uma
vez, faz GET de status via S2S assinado (POST read-only de status) e exige
estado `not_applied`, licença ativa e plano/revisão/validUntil anteriores
exatos. Revalida contrato, binding, dinheiro, quotas e prazo após I/O.
Envia APPLY_UPGRADE ou APPLY_DOWNGRADE assinado no máximo uma vez.
HTTP 2xx não é confirmação. Apenas readback S2S autenticado de ação exata,
status active, plano, revisão e validade alvo permite persistir na MESMA TX:
plano de assinatura billing, revisão e datas do contrato, histórico de
revisões BEFORE/AFTER, comando delivered. Falha/timeout => unknown sem
qualquer atualização de plano local e reconciliação SOMENTE READ-ONLY.
Se Assistant aplicou mas não é possível certificar localmente,
cria alerta único para compensação humana, sem estorno automático.

## Garantias, limites e rollback
Não há credencial, cobrança, webhook, migração operacional, deploy, job
habilitado ou homologação real neste WP. A cobrança deve já ter sido paga
e verificada em fonte autorizada — não é gerada por esta rotina.
Este WP não decide política de descontos, prorratas e troca de periodicidade;
essas exigem aprovação comercial futura explícita. A configuração dos valores
permanece na FM. Rollback pode desativar o dispatcher e interface novos,
preservando intents/auditorias e sem rearmar unknown para pending.
Somente CI 4/4 PR + pós-merge poderá certificar GREEN_INTERNO.
