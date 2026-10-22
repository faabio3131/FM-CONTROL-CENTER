# VendeAtendeIA — P01: quota readback FM Core

**Data:** 22/10/2026. Construção interna. Integração real permanece desabilitada até BUILD_COMPLETE_INTERNAL_GREEN.

## Contrato e fronteiras

O FM Command verifica o comando corretivo C06 entregue, a reativação assinada pelo Assistant e o pagamento do cliente diretamente no ledger financeiro antes de assinar consulta ao Core. A identidade externa do tenant é extraída do comando comercial canônico, nunca do corpo enviado pelo cliente.

A rota corporativa de consulta é `POST /api/billing/products/{productId}/vende-compensation-intents/{intentId}/core-quota`, com corpo **somente** `{unitId,capability}`; `capability` aceita interpretação de texto ou transcrição de áudio. A operação é somente leitura e exige sessão FM owner/admin, `commercial:read`, escopo de produto e case id autenticado.

O adaptador Command→Core chama `POST /internal/v1/command/ai/quota-readback` com HMAC SHA256 sobre o método, caminho fixo e corpo literal, nonce, timestamp UTC e segredo exclusivamente da FM. Nenhum navegador, cliente ou gateway recebe a chave. A URL é HTTPS, sem parâmetros, credenciais ou host local. Corpo da resposta limitado a 24576 bytes, redirects negados, timeout 5 s, sem cache.

**Configuração futura (desligada até autorização específica):**

```dotenv
FM_COMMAND_CORE_QUOTA_READBACK_ENABLED=false
FM_COMMAND_CORE_QUOTA_READBACK_ORIGIN=https://core.example.test/
FM_COMMAND_CORE_QUOTA_READBACK_SECRET=<secret-from-approved-secret-manager>
```

O Core confere assinatura interna, busca novamente grant válido no Assistant para exatamente a mesma unidade e capacidade, lê o ledger existente e verifica revisão, limites/janelas e saldos. Se ainda não houve projeção segura, o resultado é INDISPONÍVEL — jamais custo ou quota zero inventados. Verifica-se apenas aquela unidade/capacidade naquele momento; `coreQuotaVerified` retornado é escopado por unidade, não pelo cliente inteiro.

O Command revalida Assistant+PSP novamente após a rede e só retorna `core_unit_policy_verified` se o Core realmente comprovou grant fresco e quota consistente. O endpoint não reserva tokens, não envia requisição ao provedor, não altera contrato, não cria ou encerra divergência financeira. Qualquer evidência contraditória, queda de transporte ou status indevido falha fechado.

## Limitações explícitas

- Não equivale a aprovação de próxima requisição de IA; o Core revalidará saldo e licença no ato.
- Não prova todas as unidades/capacidades, nem homologação externa ou provider settlement.
- Não usa S2S de FinOps nem modelo de IA. Não altera os fluxos de billing ou C06 já certificados.
- Nunca declara `caseResolved=true`. Eventual encerramento P01 exige rito separado.
- O repositório FM Core PR #3 depende da branch candidata Core PR #1 ainda Draft; a porta de produção não é considerada homologada até consolidação posterior.

## Gates

Testes unitários do parser HMAC e adversariais, autorização corporativa da rota HTTP, isolamento de produto/tenant, segunda leitura de Assistant+PSP após Core, verificações de limites e dados não confiáveis. Nos repositórios respectivos: quatro gates Command e CI+segurança quota Core no SHA exato. Pós-merge verificar main e registrar indisponibilidade de checks se o conector não expuser runs push.

Testes com servidores externos reais e segredos permanecem adiados até 100% de construção.