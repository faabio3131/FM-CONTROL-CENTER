# VendeAtendeIA — observações autenticadas de pagamento (B1.3)

Construção interna C03/C06/F3/F9. Não equivale a homologação Asaas nem a liquidação
contábil, reativação remota ou licença confirmada. Nenhuma chamada real nesta entrega.

## Autoridade e configuração

`VendePaymentReadbackService` recebe TenantContext FM owner/admin com commercial:write
e StepUpProof do mesmo ator, com até cinco minutos. A composição HTTP produz
esses objetos a partir da sessão autenticada; não aceita claims de ator enviados pelo cliente.
Não há rota pública que aceite observações ou payloads de webhook como prova.

`bindPayer` registra uma associação imutável por fatura entre o pagamento já registrado,
conta do gateway e customer Asaas revisado pela FM, com source_ref e auditoria. Customer
SaaS não é customer PSP. Repetição idêntica é idempotente; mudança silenciosa é negada.
O cadastro é configurável por dados e não cria cobrança, cliente externo ou segredo.

`observe` permanece OFF por padrão (`FM_COMMAND_VENDE_PAYMENT_READBACK_ENABLED=false`).
A conta canônica fornece provider, ambiente e secret_ref. O adapter recebe um port de
segredos scoped por tenant+conta+provider+ambiente; o adapter env existente é o default,
e composição de servidor pode injetar um resolver de vault. Não há segredo no banco/log.
Endpoints pertencem ao protocolo Asaas sandbox/production, nunca a uma URL livre do usuário.
`externalReference` deve ser o UUID da fatura canônica, conforme emissor genérico existente.
Outros formatos exigem conciliação explícita, nunca heurística ou fallback IRON/Kordena.

## Protocolo interno

1. Validar ator, produto Vende, fatura BRL, conta habilitada, pagamento e payer binding.
2. Sob lock transacional por tenant/fatura, reclamar observation_id único, impedir outra
   leitura simultânea e auditar antes da rede. Registrar needs_attention para invalidar
   prova anterior. Uma tentativa processing impede uso de prova antiga nos fences C06.
3. Fazer um único GET autenticado /v3/payments/{id}; sem body, redirects, cache ou retry.
   Comparar payment/customer/externalReference/valor/forma/deleted; limitar resposta a 64KiB.
4. PENDING/OVERDUE → unpaid_verified; RECEIVED → settled_verified; REFUNDED → reversed_verified.
   CONFIRMED, cash, partial refund, chargeback ou estado desconhecido → needs_attention.
   Erro de rede/JSON/HTTP/credencial/vínculo também não produz prova financeira positiva.
5. Reabrir transação e revalidar snapshot canônico. Mudança durante I/O ou duração acima
   de 30s resulta needs_attention. Persistir observação, estado e auditoria atomicamente.
6. Replay devolve somente estado da operação; não faz GET, não renova validade da prova.
   Outra observação exige ID novo e autorização válida. Tentativas abandonadas ficam
   bloqueadas até `quarantine` governado, após 30s, sem HTTP/retry; resposta tardia perde o fence.

A consulta não altera status de invoice/payment, saldo, assinatura ou licença. Um erro
não pode reutilizar prova antiga de inadimplência, mesmo com tolerância de relógio futura.
Sequência monotônica de needs_attention invalida observações anteriores; uma nova leitura
positiva deve ser registrada depois. Suspensão e regularização continuam seus gates próprios.

## Validação e recuperação

Testes HTTP usam respostas sintéticas; testes SQL usam PostgreSQL descartável. Cobrem
identidade, valor, parsing, segredo, payload grande, estados incertos, binding imutável,
auth/step-up/flag, replay, concorrência, prova antiga, alteração durante I/O e quarentena.
Migration 0017 é aditiva às tabelas e amplia o enum de outcome com estado não autorizante.
Rollback: deixar flag OFF, preservar histórico/tabelas/needs_attention; não apagar evidência
nem restringir o check enquanto houver linhas desse estado. Reverter código de produção
exigiria manter os readers fail-closed. Nenhuma migration operacional autorizada.

Pendências separadas: scheduler, emissão comercial que registre o payer
binding automaticamente, ciclo completo de assinatura, compensação pagamento/suspensão,
snapshot de termos e homologação externa após BUILD_COMPLETE_INTERNAL_GREEN.

## B1.4 — supervisão corporativa por fatura

O painel de planos do produto Vende contém a supervisão de pagamentos. GET e POST
`/api/billing/products/{productId}/payment-readback` exigem sessão corporativa FM e
permissão comercial; nenhum tenant/ator/URL/segredo/outcome é aceito do navegador.
GET recebe somente invoiceId, consulta dados locais e retorna associação e até 20
tentativas, com indicação de truncamento. Produto, fatura e conta são revalidados;
conta revogada ou produto inativo resultam indisponibilidade, nunca prova positiva.
O read model expõe colunas explícitas, sem segredo, hash interno ou payload do PSP.

POST permite bind, observe ou quarantine. Corpo limitado a 4096 bytes, campos exatos,
senha do mesmo ator e pré-auditoria obrigatória. A auditoria do resultado pertence à
transação do serviço. Observe exige flag ON no servidor; o cliente não pode ativá-la.
Bind e quarantine são operações locais governadas mesmo com flag OFF. Não existe
endpoint para inserir prova de pagamento nem atualização de estado financeiro.

O painel preserva observationId ao atualizar a mesma fatura e após resposta incerta;
a ação de preparar nova observação é explícita. Usar ID já existente consulta somente
o estado da operação. Uma falha de atualização do painel após sucesso é exibida como
operação registrada, evitando instrução enganosa para repetir uma alteração.
Senha é limpa após toda tentativa. Não há polling ou consulta automática ao provider.

Validação adicional: testes de ingresso cobrem sessão, escopo, campos extra, payload
grande, step-up, auditoria indisponível, flag, replay ID e sanitização; PostgreSQL
descartável verifica projeção limitada, ausência de segredos e isolamento por produto.
Rollback: reverter API/painel mantendo serviço, histórico e flag OFF; nenhuma migration
adicional nem alteração operacional de configuração integra esta unidade.

## Referências de protocolo consultadas em 21/10/2026

- https://docs.asaas.com/reference/recuperar-uma-unica-cobranca
- https://docs.asaas.com/docs/payment-events
- https://docs.asaas.com/reference/list-payments
- https://docs.asaas.com/reference/create-new-payment

Essas referências documentam o protocolo; não comprovam uma integração viva.
