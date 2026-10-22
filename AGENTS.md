# AGENTS.md — FM CONTROL CENTER / FM COMMAND
Status: normas operacionais do repositório. Data: 2026-10-19.
Referências superiores: Documento Mestre Nova FM v2; Padrões de Construção; Fundação FMCC; Plano Mestre F00–F22; System Design e ADRs aprovados; decisões humanas posteriores. Este arquivo NÃO revoga o plano ou autoriza operações proibidas.

## Missão
Executar autonomamente o cronograma em docs/governance/FMCC_CRONOGRAMA_MESTRE_COMERCIAL_7_FLUXOS_2026-10-19.md, aproveitando código e contratos existentes. Command é o painel corporativo FM e deve ser reconciliado com a identidade FM Control Center (FMCC); não renomear repositórios, APIs ou contratos sem decisão registrada. FM Tecnologia = Tenant Zero, sem privilégio arquitetural exclusivo e com isolamento multi-tenant. Cada SaaS mantém seu Core cognitivo vertical próprio.

## Protocolo obrigatório do executor
1. Ler este AGENTS.md, o cronograma comercial, o Plano Mestre F00–F22, o checkpoint mais recente, System Design, ADRs e instruções locais antes de qualquer mudança. Reconhecer decisões posteriores.
2. Em cada retomada, verificar repositório, main, branch, HEAD, diff e trabalho não commitado, PRs relacionadas, testes, ambientes, dependências e fontes canônicas. Nunca descartar mudanças alheias.
3. Classificar cada alegação FATO/CURRENT/TARGET/HIPÓTESE/PENDÊNCIA/DECISÃO; documento-alvo não prova deploy; PR mergeable não equivale a gate verde; testes não executados são NOT_TESTED.
4. Selecionar a próxima unidade de trabalho desbloqueada do cronograma, com requisito, critério de aceite, responsável, autoridade canônica, impacto, contratos, security threat-model e estratégia de rollback; fazer a menor mudança integral.
5. Implementar na branch apropriada, corrigir falhas e reexecutar os gates afetados; preservar testes, asserções, compatibilidade e comportamentos existentes. Atualizar ADRs e contratos quando aplicável.
6. Executar lint, typecheck, build, unit, integração, contrato, banco descartável, migrations, E2E, tenancy, segurança e recuperação proporcionais ao escopo. Registrar comandos, SHA, ambiente, output e skips. CI com runner=null/steps=0 = BLOCKED_EXTERNAL, jamais aprovado.
7. Revisar diff, segredos, migrations, segurança, autoria e escopo. Revisão independente de segurança/QA não pode ser substituída por autoavaliação.
8. Fazer merge SOMENTE com autorização aqui concedida para PRs de escopo regular: branch/HEAD conferidos, sem STOP, revisões aplicáveis e TODOS os gates obrigatórios comprovadamente GREEN no SHA pertinente, com base atualizada e conflitos resolvidos. Após merge conferir main e CI pós-merge. Falha = corrigir e retestar, não contornar. Publicação/produção, despesas, novas credenciais reais, mudanças destrutivas, migrations operacionais e alterações financeiras reais exigem autorização específica.
9. Atualizar checkpoint com fase, WP, implementado/integrado/testado/homologado/produção, evidências SHA/PR/CI, riscos, bloqueios e próximo passo. Avançar sem novas perguntas quando houver autorização e dependências resolvidas; não pular gates.

## Autoridades e invariantes comerciais
- Control Plane FMCC: catálogo de SaaS, planos/preços/versionamento, contratos comerciais, assinaturas, customer binding, contas/rotas de gateway, ledger financeiro e auditoria, conforme contratos canônicos existentes.
- SaaS vertical: runtime, tenancy interno, enforcement transacional local de entitlement/quota, telemetria autoritativa de consumo, status de provisionamento; nunca confiar em valores do frontend.
- Gateway autorizado: autoridade sobre eventos externos de pagamento; webhook sozinho não é prova de liquidação; reconciliar via leitura autenticada e estado canônico. Não misturar assinatura FM→cliente SaaS com pagamentos do cliente→consumidores.
- IDs distintos: product, customer, subscription, license/entitlement, external_tenant, plan_version, provider_account, provider_payment; não reutilizar identificador de outro domínio. Vincular pagamentos a produto+cliente+assinatura+tenant e provider externo verificável.
- Mudanças comerciais governadas: autenticação, role/permission no servidor, step-up FM, prévia, aprovação quando aplicável, validação de versão, idempotência, auditoria. Nunca alterar retroativamente contrato sem política explícita.
- Quotas IA: capacidade disponível em todos planos salvo decisão posterior; diferenciação por teto e valores editáveis FM. Custos internos de modelos pertencem à FM, com moeda e origem; desconhecido != zero. Limite determinístico no SaaS antes da chamada, com reserva atômica/concurrency/idempotência e reconciliação.
- Configurações Command→SaaS: contrato assinado/mTLS ou mecanismo aprovado, escopo produto+tenant+capability+versão+validade, anti-replay, ack, reconciliador, fallback seguro, sem retry cego nem dependência remota no hot path crítico.
- QR Code WhatsApp: política FM 45s máximo de exibição, com timeout externo menor prevalecendo; não reutilizar código expirado. Alteração futura central só entra no Assistant após sincronização autenticada comprovada.
- FMCC Core vertical: explica e consulta métricas autorizadas com proveniência; nunca autoriza, calcula finanças sem fonte nem executa SQL arbitrário.

## STOP
Cross-tenant, bypass de auth, segredo exposto, fraude, autoridade financeira incerta, corrupção/perda de dados, migração destrutiva não planejada, vulnerabilidade grave, mudança estrutural não aprovada. Suspender somente operação afetada, preservar provas e continuar trabalho independente seguro.

## Política de avanço
Construção interna completa e verde é distinta de homologação externa. Não bloquear desenvolvimento independente por ausência de gateway/WhatsApp/KYC reais, mas não declarar estes homologados nem habilitar fluxos reais. Não criar cronogramas paralelos; associar WPs comerciais às fases F00–F22 e seus gates. Nenhuma porcentagem planejada comprova avanço real.

## Integração reconciliada PR #90 — F3 Command / Assistant / Core (2026-10-20)

**Escopo e precedência:** o protocolo geral comercial C00–C09 deste AGENTS.md permanece canônico; as decisões e checkpoints específicos de F3 da PR #90 permanecem disponíveis em `docs/governance/FMCC_PR90_AGENT_EXECUTION_HISTORY_2026-10-20.md`, sem substituição das normas globais nem do cronograma F00–F22.

**Base histórica verificada:** PRs IRON #69, #75–#88 (incluindo GET financeiro read-only, inbox Asaas, outbox durável, entrega governada e isolamento de fontes/credenciais) **já integradas antes** do ponto de ramificação de F3 (`18f1d1b2c928`). Preservar a API read-only de verificação e as rotas de mutação autorizadas como contratos distintos. Não criar segunda autoridade de billing/licenças ou reemitir uma licença IRON.

**Novas integrações main preservadas:** PR #91 — editor de preços e limites Kordena com catálogo autoritativo; PR #93 — cronograma dos sete fluxos e contrato padrão Command↔SaaS em estágio candidato. Nenhuma PR F3 pode transformar o contrato de identidade Core↔Assistant em API universal de preços nem sobrepor Kordena/IRON.

**F3 permanece BUILD_IN_PROGRESS:** PR #90 em Draft; promover a merge apenas se não houver conflitos e lint, typecheck, build, regressão, banco PostgreSQL, integrações entre repositórios e revisão de segurança estiverem todos verdes no HEAD EXATO. Falha ou ausência de GitHub Actions não é aprovação; credenciais reais, migração de produção e homologação externa continuam separados da construção interna.


## F3 / C04 — Worker de licenças governado (2026-10-20)

O scheduler VendeAtendeIA é preparado **OFF por padrão** e nunca pode ser ativado por configuração do cliente. A variável FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED somente pode ser habilitada pela FM após gate operacional aprovado. POST /api/internal/workers/vende-license-outbox exige token dedicado (não chave HMAC Assistant) e corpo vazio. Todo lote é limitado, pré-auditado, scoped ao tenant corporativo, com CAS PostgreSQL por licença, quarentena de claims antigas e ausência de retry cego. Operação manual exige sessão FM owner/admin, reautenticação do mesmo usuário, pré-auditoria e lote 1–20. A supervisão deriva contagens de todas as linhas canônicas e exibe alertas por bloqueios, jobs antigos e atraso de fila. Prova remota positiva ainda exige reconciliação exata e revalidação transacional de fatura, pagamento e plano. Nunca declarar entregas em estado unknown como concluídas, nem ativar cron externo, segredos, deploy ou migrations reais nesta fase. Contrato, limites, runbook, alertas e rollback: `docs/FMCC_F3_VENDE_LICENSE_WORKER_OPERATIONS.md`. Revisão independente e gates HEAD exato continuam obrigatórios.


## Cadência obrigatória por etapa — decisão humana 20/10/2026
Não criar nova cadeia de PRs empilhadas para a construção regular. Partir da `main` atual verificada, abrir uma única PR por unidade de trabalho, executar e corrigir todos os gates aplicáveis no HEAD exato, obter revisão aplicável e fazer merge assim que elegível pela autorização vigente. Conferir `main` e CI pós-merge; só então iniciar a etapa dependente seguinte. Quando houver bloqueio (revisão, CI, segurança, conflito, aprovação material), registrar a causa e **não** forçar merge nem declarar conclusão; só executar trabalho independente em branch segregada se necessário, sem acumular candidatos redundantes. PR #62 legada exige reconciliação de billing e gate cognitivo, não reaplicação automática. Sem produção/deploy, credenciais, alterações financeiras reais nem migrations operacionais por autorização genérica de merge.

## C08 — Cadastro padronizado de SaaS (20/10/2026)
O catálogo único de perfis de adaptadores fica em `src/application/integration/saas-adapter-profiles.ts`. Interface e Source Registry devem usar esse contrato; não recriar mapas por produto em componentes. Um novo SaaS requer Connector REAL registrado em `connector-composition.ts`, contrato versionado, teste de paridade, autorizadores por tenant/produto e secrets por referência. Perfil presente, source cadastrada e health local não demonstram conexão S2S E2E, pagamentos ou homologação. Seguir a regra vigente: uma PR regular por etapa, gates e revisão no HEAD exato, merge elegível antes da etapa seguinte, sem operações externas por autorização implícita.

## Gate C08 de pré-admissão de SaaS
`src/application/integration/saas-adapter-preflight.ts` é somente diagnóstico local do Source Registry e Adapter Profile. A API C08 expõe `adapterPreflight` sanitizado sem criar autorização, conexão E2E, credencial, consumo, entitlement ou billing. Diferencie `local_contract_ready` de `externallyHomologated`; não pule revisão do handshake S2S nem invente live. Corrija bloqueios antes de merge; mantenha uma PR regular por vez.

## Manifesto offline C08
`inspectSaasCapabilityManifest` é parser de dados NÃO CONFIÁVEIS e somente valida compatibilidade técnica com o `Connector` real. Ele não autentica serviços, não escolhe HMAC/mTLS, não governa permissão, não executa comandos nem confirma E2E. Para integrá-lo à rede é obrigatório transporte autenticado e validação determinística de tenant/identidade nas duas pontas, além de testes de replay e recuperação.

## C06 — Contratos, feriados FM e executor transacional interno (20/10/2026)
- Ramo isolado `feat/c06-vende-terms-calendar-execution-v1-20261020` nasceu da `main` conferida e reusa **exatamente** a política humana V1 da PR #122 (códigos puros versionados), sem mexer em IRON ou Kordena. PR #122 continua aguardando revisão independente: reconciliar ancestralidade/conteúdo antes de qualquer merge e NÃO declarar políticas duplicadas como entregas independentes.
- Migration aditiva `0015_vende_commercial_terms_calendar`: contrato Vende vigente/versionado com `effective_from`, `paid_through`, `due_date` civil date BR e fonte auditada; calendário FM com feriados/jurisdição e revisões imutáveis; log append-only de alteração de contrato; ledger de observações independentes do gateway; fila idempotente de comandos de licença. Nunca inferir vencimento de `invoice.created_at`.
- `GovernedVendeC06Service` exige escopo FM corporate owner/admin commercial:write e `StepUpProof` do mesmo ator com idade <=5min, em chamadas *internas*, antes de persistir. `publishCalendar` exige fonte/revisão, região e cobertura exatas; `enrollPaidTerm` exige assinatura ativa, fatura realmente marcada paid e pagamento provider received no Command, com contrato revisado manualmente; `requestSuspension` compara revisão CAS, fatura unpaid, observação autenticada recente de conciliador, férias/feriados governados e data local D5 + 3 úteis COMPLETOS, além de destinatário SaaS canônico.
- `requestSuspension` grava **suspension_pending**, auditoria e `outbox.pending` no mesmo TX; `pending` NUNCA equivale a licença suspensa na vertical, ACK confirmado ou revogação efetiva no Core. O worker remoto deve ser construído para entrega assinada não-replay e reconciliação read-only; não realizar POST cego. A tabela de observações *não possui* entrada HTTP pública: um reconciliador autorizado deverá preenchê-la de forma verificável depois de provider GET real, sem interpretar webhook isolado como prova.
- Testes PostgreSQL descartáveis: escopo FM, step-up, calendário holiday, idempotência/revisão, pagamento não verificado, ata de aprovação, PSP attestation stale, corrida dupla concorrente, audit/outbox exatamente uma vez.
- Aprovado **somente planejamento de software**: migration nunca aplicada no banco persistente de produção, nenhum deploy, gateway/IA/Evolution reais, cobranças, alteração financeira nem suspensão remota de clientes. Gates no HEAD final, CI de migração + PostgreSQL, revisão independente e integração cross-repo ainda exigidos. Reativação, upgrade/downgrade, cancelamento efetivo e worker com confirmação S2S permanecem fases de implementação interna distintas, não homologação externa.

## VendeAtendeIA — cronograma vinculante de construção 100% interna (20/10/2026)

- Para WPs do VendeAtendeIA, seguir o cronograma canônico
  `faabio3131/-FM-Assistant-Base/docs/governance/CRONOGRAMA_MESTRE_CONSTRUCAO_100_INTERNA.md`,
  preservando o plano FMCC F00–F22 para capacidades corporativas comuns.
- A primeira unidade é B0: reconciliar diffs únicos e dependências das PRs #114 e #118–#124,
  selecionar um candidato canônico, impedir duplicidade de autoridade e integrar somente conteúdo
  completo com 4/4 gates, contratos cross-repo e CI pós-merge verdes.
- As configurações de produto, plano, preço, limite, calendário, gateway, credencial e destino SaaS
  devem ser data-driven e governadas; cadastrar novo cliente não pode exigir código ou deploy.
- Construir agora ports, configuração, fakes, migrations e testes internos. Asaas/WhatsApp/Evolution,
  provider de IA, Vault/TLS/DNS, credenciais e operações reais ficam em homologação externa somente
  após `BUILD_COMPLETE_INTERNAL_GREEN`.
- O executor está autorizado a corrigir, reconciliar branches/PRs, commit/push, executar auditoria
  interna em passe separado, fazer merge de WP 100% verde, validar main e avançar sem nova consulta.
- Continuam fora da autorização genérica: deploy/cutover, banco/segredo/cobrança/envio real, gasto,
  homologação externa antecipada, política comercial nova e operação destrutiva.


## C04 — Publicação do limite visual do QR FM→Assistant (20/10/2026)
A autoridade é a revisão persistida da política QR corporativa VendeAtendeIA, editada apenas por owner/admin FM, com step-up. Uma sincronização manual autenticada, pré-auditada e desativada por padrão pela flag `FM_COMMAND_VENDE_QR_POLICY_SYNC_ENABLED` envia a revisão assinada sob HMAC de caminho separado para `/internal/v1/command/whatsapp-qr/policy`; somente origem HTTPS pré-configurada. Nunca aceitar URL, tenant, segundos, revisão ou ator do corpo enviado pelo cliente. O Assistant rejeita replay de nonce, versões antigas, assinaturas inválidas, escopos estrangeiros e revisões conflitantes. Falha de rede permanece `unconfirmed`, mesmo se o provedor HTTP tiver aplicado a mudança; uma nova solicitação humana pode retransmitir apenas a mesma revisão idempotente, sem efeitos financeiros. O período é cap de **exibição**, não promessa de validade real da Evolution. Nenhuma ativação externa/deploy/credencial autorizada.


## F3 — Release gate for cross-repository licensed AI consumption (20/10/2026)
`tests/f3_command_license_quota_journey.py` must execute the **actual Command license signer** and Assistant binding verifier with unique nonce both before and after tenant license suspension, then require Core signed-grant quota admission to fail for the subsequent request. It is forbidden to certify any stale binding-status as current entitlement. Foundation pins fully specified Assistant/Core commits and runs against disposable storage; a green Core or Assistant CI alone does not prove this cross-code contract. Maintain the history of held, uncertain reservations; never refund unknown provider usage. All production activations, real secrets and external provider homologation remain postponed until full construction. No claim that F3 is complete based solely on this gate.


## F3 — Assinatura de security hold (20/10/2026)
Existe um componente PURO `assistant-license-security-hold-signer.ts` que produz o contrato HMAC FM Command→Assistant para suspensão operacional, com ator humano, step-up recente (300s), planCode/revision, `expected_valid_until` obtido de fonte autorizada, nonce novo e command_request_id único. **Não há sender público nem ativação automática**: construir o fluxo administrativo exigirá prova independente do estado corrente da licença, RBAC FM, reautenticação, auditoria pré-envio, política de recuperação de resultado incerto e flag OFF por padrão. Não confundir suspensão de segurança com cancelamento financeiro, devolução, prorrata ou upgrade. O consumidor Assistant mantém trilha imutável e bloqueia acesso a quotas ao suspender. PR e CI trans-repo devem ser GREEN no SHA exato; sem review independente, não mergear.

## B0 — Candidata unificada e execução autônoma (21/10/2026)
A PR #124 é a candidata única de reconciliação do VendeAtendeIA. Incorpora os
contratos/testes de #118–#121, a API de política de #122 e a evolução de #123.
#114 é representada pela correção equivalente de #120; não aplicar duas vezes.
A autorização humana desta sessão permite auditoria interna em passe separado,
correção, merge com gates verdes e avanço automático. Não alegar revisão externa.
Detalhes, evidência e rollback: `docs/governance/VENDE_B0_RECONCILIATION_2026-10-21.md`.
O gate externo do Preview é manual; os quatro gates internos devem rodar em PR
e main. A configuração Render deve ser revalidada antes do merge: auto-deploy OFF.
B0 integra a baseline; os achados funcionais C06 restantes pertencem a B1 e
continuam explícitos. Não habilitar executores reais nem declarar F3 concluída.

### B0 — main e gatilhos de CI
PR #124 já integrada em `2a041d282a0135c02a36daef53fcc6fb90100705`; não repetir.
PRs #114/#118–#123 substituídas. Corrigir/validar Cognitive em push main;
confirmar os quatro workflows pós-merge antes de encerrar B0. Cada aplicação
continua com homologação externa adiada e executores reais OFF.

### B1 — evidências financeiras sucessivas
B0 concluído com quatro gates pós-merge na main `9b27fb0663c16d3d1d8d05cbe4addea1c91c38ea`. Preservar histórico de observações do mesmo pagamento: cada leitura autenticada futura recebe source_ref próprio; repetir a mesma observação não pode inserir outra linha. Ordenar por verified_at, created_at e observation_sequence decrescentes em todos os fences. A sequência desempata observações, não prova autenticidade nem substitui vínculo canônico do PSP. Nenhuma rota pública de gravação ou executor real é habilitado por esta migração.

### B1.2 — vínculo canônico da evidência de pagamento
Toda decisão C06 que consome atestação deve usar `currentBoundVendePaymentEvidence`: tenant, fatura e conta do gateway identificam um único pagamento persistido; external_payment_ref da última observação deve coincidir exatamente. Não buscar prova positiva antiga se a última for inválida. Evidência unpaid com pagamento local recebido/confirmado/revertido ou estado desconhecido falha fechada. O produtor autenticado do PSP e a compensação de corrida remota continuam tarefas separadas; o leitor não autentica payload público.

### B1.3 — produtor governado de observações PSP
`VendePaymentReadbackService` e adapter Asaas GET são internos, OFF por padrão. Registrar
payer PSP separadamente do ID SaaS, com revisão FM e vínculo imutável por fatura. Nunca
aceitar webhook/frontend como evidência. Claim e needs_attention precedem HTTP; snapshot
canônico é revalidado depois. Processing ou evidência incerta mais nova bloqueiam prova
anterior, inclusive com skew de relógio. Replay não consulta nem refresca prova; quarentena
após 30s nunca reenvia. Não alterar invoice/payment/licença a partir desta leitura.
Configuração, limites, testes, rollback e pendências: docs/FMCC_VENDE_PAYMENT_READBACK.md.

### B1.4 — supervisão de observações PSP
A rota payment-readback é corporativa FM, scoped por produto/fatura. GET consulta somente
dados locais; POST exige campos exatos, body limitado, step-up do mesmo ator e pré-auditoria.
O browser nunca fornece outcome, tenant, segredo ou ativação. Observe continua OFF por
padrão no servidor. Preservar observationId após falha para impedir nova consulta por
repetição acidental. Resultado recorded significa observação persistida, nunca invoice
paga ou licença alterada. O painel não é autoridade financeira nem homologação externa.

### B1.5 — aprovação original de comandos comerciais
Persistir approved_at do StepUpProof original no intent C06. Dispatch não pode trocar
essa data por now, created_at ou data de execução. Comando sem aprovação, no futuro ou
com mais de 300s bloqueia antes de claim/rede; revalidar prova e ator antes da mutação.
Migration aditiva mantém NULL legado não autorizante, sem backfill que invente aprovação.
Readback de outcome unknown pode continuar após expiração, sem segunda mutação. Renovação
de aprovação exige fluxo FM explícito ainda separado; nunca UPDATE automático do timestamp.

### B1.6 — reaprovação FM explícita
`reapproveVendeDelinquency` permite nova aprovação humana somente de SUSPEND_DELINQUENCY
pending, sem claimed_at/delivered_at, com aprovação ausente ou vencida. Exigir RBAC FM,
step-up do mesmo ator, CAS da aprovação observada, produto ativo, vínculo SaaS canônico,
contrato na revisão esperada e evidência unpaid fresca. Preservar aprovação/ator anteriores
na auditoria transacional; falha de auditoria deve impedir a alteração. Nunca resetar
processing/unknown/delivered/blocked nem disparar rede neste fluxo. API/painel não podem
fornecer nova data de aprovação ou trocar estado. Delivery continua OFF por padrão.

### B1.7 — histórico das revisões contratuais
As quatro mutações de termos C06 registram before/after na mesma transação da revisão,
com projeção explícita e schema fm.vende.contract-terms.v1. Não reescrever auditoria nem
reconstruir NULL legado a partir do contrato atual. Histórico corporativo FM valida
produto/assinatura/tenant e pagina por revisão (100). Snapshot representa intenção
contratual aprovada; não representa ACK remoto, preço ou quotas do catálogo. Documentação:
docs/FMCC_VENDE_CONTRACT_REVISION_HISTORY.md. Homologação externa permanece adiada.

### B1.8 — entrega interna de reativação
Reativação mantém os IDs e plano da assinatura vigente, exige fatura paga, PSP received e
observação settled fresca vinculada. Revalidar produto, binding, revisão, período pago e
aprovação original após status I/O. Persistir delivery_target antes de qualquer mutação;
ACK deve coincidir em operação/action/tenant/plano/revisão/validade. Pago até é dia civil
America/Sao_Paulo completo, convertido sem offset UTC fixo; não reduzir validade remota.
Timeout/crash vira unknown: recuperar somente por leitura, nunca reconstruir target nem
reenviar. Quarentena abrange reativação. Sem rota pública/scheduler novo ou ativação real;
flag C06 permanece OFF. Detalhes: docs/FMCC_VENDE_REACTIVATION_DELIVERY.md.

### B1.9 — reaprovação supervisionada de reativação nunca tentada (21/10/2026)
O painel existente de aprovações comerciais aceita modo explícito REACTIVATE_VERIFIED;
GET lista somente pending, sem claimedAt/deliveredAt, sem aprovação fresca, por tenant e
produto Vende; POST exige senha/step-up do ator corporativo, ação em enum estrita,
CAS do timestamp observado, auditoria na mesma transação e evidência settled_verified
fresca vinculada à fatura paga. Reusar eligibility() do dispatcher B1.8, incluindo
produto ativo, binding SaaS, plano, período e revisão, sem novo motor financeiro.
Não reaprovar processamentos já reclamados, unknown, delivered, blocked ou targets
persistidos. Reaprovação só altera ator/data do pending, não envia comandos, não modifica
pagamento/quotas nem muda licença. Suspensões B1.6 continuam compatíveis com requests
legados sem campo action; seleção de ação externa jamais prevalece sobre row.action.
Auditoria, testes e rollback: docs/FMCC_VENDE_REACTIVATION_DELIVERY.md. Gates 4/4
obrigatórios no HEAD e pós-merge; habilitação real continua OFF.

### B1.10 — supervisão somente leitura de claims comerciais (21/10/2026)
A API e UI C06 de supervisão são consultas FM corporativas por tenant+produto,
sem aceitar escopo de cliente por query. Agregados cobrem todas as linhas;
a projeção recente é limitada e sinaliza truncamento. Unknown não autoriza
reenvio e delivered no Command não dispensa conferência do entitlement corrente.
Processamento antigo e aprovação vencida geram alertas, nunca jobs automáticos.
Endpoint GET tem no-store, RBAC FM, erro sanitizado, zero POST/mutação.
Nenhum scheduler/worker/provider/migration/deploy é ativado nesta unidade.
Referência e rollback: docs/FMCC_VENDE_C06_CLAIMS_MONITOR.md.

### B1.11 — detectar operação remota aplicada sem confirmação financeira local (21/10/2026)
Se o readback autenticado do Assistant indicar `applied` e o Command não conseguir
confirmar atomicamente elegibilidade de pagamento/contrato, preservar o comando
`unknown` e emitir um único evento `vende.compensation_review.required`
na mesma transação do claim sob lock. A evidência é append-only, escopada
por tenant, produto e operação, sem segredos nem suposição de revogação automática.
Recuperações repetidas NÃO reenviam mutações ou duplicam alerta.
O total no painel é HISTÓRICO, não casos abertos nem execução de compensação.
Não alterar billing, quotas, licença, gateway, política comercial, worker,
deploy ou migrations. Reparação efetiva e varredura de reversões após
`delivered` permanecem no cronograma. Fonte e rollback:
`docs/FMCC_VENDE_COMPENSATION_RISK_B111.md`.

### B1.12 — alerta de mudança financeira posterior a entrega confirmada (21/10/2026)
O produtor existente de readback do PSP, depois de autenticar binding, gateway
e observação, e validar snapshot após I/O, deve sinalizar risco se uma observação
`reversed_verified` suceder uma reativação já delivered, ou
`settled_verified` suceder suspensão já delivered da mesma fatura.
Registrar um único `vende.compensation_review.required` por command via
auditoria append-only no TX da observação; nunca alterar invoice, pagamento,
subscription, status de licença nem reenviar comando. Não bloquear linha da
claim sob o lock da fatura para não inverter ordem de locks do dispatcher.
O indicador no Command é contagem histórica, não alerta aberto ou compensado;
estado corrente do Assistant continua desconhecido sem readback S2S.
O produtor fica OFF por padrão. CI 4/4 + pós-merge, sem deploy/homologação.
Detalhes: `docs/FMCC_VENDE_POST_DELIVERY_RECONCILIATION_B112.md`.

### B1.13 — cancelamento final governado ao fim do período pago (21/10/2026)
SCHEDULE_CANCEL continua sendo intenção pendente com autoRenew=false; não é ACK.
Não enviar licença CANCEL_AT_PERIOD_END antes de fmPaidThroughExclusiveInstant(paidThrough).
O step-up original de agendamento expira e NÃO pode ser renovado por executor;
somente a FM owner/admin pode reaprovar o comando devido com senha e CAS exato.
Revalidar produto, escopo, termo na revisão, cliente/assinatura/binding SaaS,
prazo e plano, antes e depois do readback remoto. O dispatcher privado
OFF por padrão envia operação assinada uma única vez, sem fila automática.
Somente ACK S2S exato por leitura assinada autoriza mudar contrato e assinatura
locais para cancelled. Timeout, falta de prova, corrida ou resposta divergente
permanecem unknown para read-only reconciliation sem segundo POST.
Processing órfão pode ser isolado, nunca reencaminhado. Cliente cancelado que
retornar terá nova identidade comercial, sem reset de trial.
Testes PostgreSQL/route, quatro gates PR e pós-merge obrigatórios, sem deploy real.
Guia: docs/FMCC_VENDE_FINAL_CANCELLATION_B113.md.

### B1.14 — admissão transacional de renovação por pagamento verificado (21/10/2026)
NÃO produzir RENEW_VERIFIED com data/plano/preço enviado livremente pelo frontend.
FM owner/admin com step-up recente e referência de consentimento autoriza somente
o intento pending, após fatura paid BRL vinculada, provider received e evidência
settled_verified atual para a conta/ID de pagamento canônicos. Exigir plano
billing active e plano AI published na revisão autorizada, ambos com mesmo
planCode, preço exato e intervalo monthly/yearly do invoice, sem desconto
inventado. Derivar next paidThrough civil (inclui EOM/leap) e validUntil IANA,
congelar no delivery_target existente e criar auditoria TX. Não atualizar
contrato, assinatura, quota ou entitlement antes do ACK S2S de B1.15.
Proibir reutilização do invoice em outra transição C06; estado pending não é
assinatura renovada. Sem migration nova, worker, PSP real ou deploy.
Guia: docs/FMCC_VENDE_RENEWAL_ADMISSION_B114.md.

### B1.15 — renovação paga com ACK S2S (21/10/2026)
O target JSONB B1.14 é fonte única de plano, preço e período: não recriar
datas ou paymentRefs no envio. Reaprovação FM humana somente pending
nunca reclamado, step-up recente, CAS do timestamp e auditoria atômica.
Revalidar contrato, invoice, PSP, tenant/binding e plano antes/depois do I/O.
Readback S2S pré-POST exige prazo e plano anteriores exatos.
Enviar envelope RENEW_VERIFIED assinado no máximo uma vez e registrar
revisão, vigência e histórico BEFORE/AFTER somente com ACK S2S exato.
Unknown nunca é reenviado; compensação é alerta, sem reversão automática.
Dispatcher OFF por padrão; quatro gates PR e pós-merge. Sem deploy ou
homologação externa. Runbook: docs/FMCC_VENDE_RENEWAL_DELIVERY_B115.md.

### B1.16 — upgrade/downgrade dirigidos pelos catálogos da FM (21/10/2026)
Todas as funcionalidades SaaS continuam disponíveis; planos mudam apenas
quotas/consumo. A FM governa preços, ciclos e versões publicadas. Só permitir
upgrade se preço e todos os tetos de quota forem monotonicamente maiores
(com ao menos um teto maior); downgrade exige preço menor e limites menores,
no mesmo ciclo e com mesmas chaves resource/scope/window. Sem prorrata,
desconto, troca arbitrária de periodicidade ou datas vindas do frontend.
Pagamento vinculado ao MESMO tenant/produto/assinatura deve estar pago e
settled_verified, sem reutilizar invoice de matrícula ou outra intent.
Ao preparar, congelar versão/plano de origem e destino, preço, prova,
prazo e vigência no JSONB do comando; NÃO alterar licenças nem planos.
Downgrade só pode acontecer após o fim EXCLUSIVO do dia integral pago,
e exige reautenticação humana FM quando estiver devido.
Dispatcher privado OFF por padrão. Após revalidações e readback assinado
do estado anterior, enviar UM comando assinado. Somente ACK remoto exato
autoriza atualizar assinatura, contrato e trilha BEFORE/AFTER na mesma TX.
Timeout/erro => unknown, reconciliação apenas READ-ONLY; sem replay,
compensação ou estorno automático. Quatro gates HEAD, revisão e quatro
gates pós-merge exigidos. Não homologar/ativar PSP/Assistant externos.
Runbook: docs/FMCC_VENDE_PLAN_CHANGE_B116.md.

### PROMPT 01/04 — pacote de investigação governada de compensação (21/10/2026)
Escopo: fechar B1/F3/F9 sem reconstruir as PRs certificadas #134–142.
Os eventos `vende.compensation_review.required` são alertas históricos;
não equivalem a casos resolvidos. Somente operador FM com owner/admin,
comercial:write e reautenticação pessoal <=300s pode registrar decisão
`investigating` ou `escalated`, com compare-and-swap de versão e audit
append-only. Casos são escopados a tenant/produto/claim original. Nunca
aceitar `resolved`, estorno, reenvio de licença, reativação, alteração de
pagamento ou quota nesta revisão; não inventar state/validade do Assistant.
Concorrência: lock da claim serializa versões de revisão; falha de auditoria
reverte tudo. GET é read-only e contagem histórica, não casos fechados.
A reparação real exige outra etapa, provas financeiras e estado remoto
independentes, decisão explícita e testes E2E. Nenhum deploy ou homologação
externa. Matriz: docs/governance/VENDE_P01_RECONCILIATION_EVIDENCE_2026-10-21.md.
P01 continua IN_PROGRESS até terminar todas as lacunas dos três repositórios.

### P01 — teste cruzado de quotas de texto/áudio com revogação (21/10/2026)
Reutilizar o harness existente `tests/f3_command_license_quota_journey.py`,
que executa o signer real Node do Command, o receptor de licença SQLAlchemy
do Assistant e `PlanUsageGuard`/ledger de quota do Core sobre bancos
descartáveis. Ampliado para admitir texto + áudio sob quota agregada de
tenant, exigir replay-denial, suspensão de ambas as capacidades e manter
reservas históricas após revogação sem reembolso inventado. Não construir
outro guard, não afirmar chamadas de provider ou custo monetário quando o
teste cobre apenas reservas de tokens. CI do Foundation + cross service
exigido, documentação no P01 reconciliation evidence. P01 geral IN_PROGRESS.

### P01 — supervisão de aprovações comerciais vencidas (21/10/2026)
A contagem operacional de reaprovações vencidas deve incluir RENEW_VERIFIED,
APPLY_UPGRADE e as ações previamente cobertas, mas CANCEL_AT_PERIOD_END
(SCHEDULE_CANCEL) e APPLY_DOWNGRADE entram somente após fim integral da
data local `effectiveDate`. Itens futuros podem aparecer como pending,
porém NÃO são pendências de reaprovação vencida. Não reautorizar sozinho,
não alterar prazo ou tentar remediar indevidamente. Testes PostgreSQL
sintéticos verificam ausência de count antes da data e inclusão depois.

### Prompt 01 — coleta autenticada de evidência de compensação (21/10/2026)
O conciliador PSP deve registrar alertas também quando uma renovação
já entregue sofre estorno verificado posterior, sempre uma vez por comando.
O revisor FM owner/admin só pode obter snapshot comercial do Assistant
após triagem humana investigando/escalated, senha de step-up pessoal,
correlation scoped, versão CAS e flag C06 explicitamente habilitada.
Consulta S2S operation-scoped somente READ, sem transição, estorno,
reembolso, reconciliação de quota, novo pagamento ou reenvio. Rechecar
claim, escopo, revisão e finanças após I/O antes de guardar audit
append-only com metadados categóricos e sem segredos. Nunca publicar
`caseResolved` true nem declarar remediação realizada por readback.
Configuração real ficará para homologação pós BUILD_COMPLETE.
Documento: docs/governance/VENDE_P01_COMPENSATION_EVIDENCE_2026-10-21.md.


## VendeAtendeIA P01 — compensação corretiva supervisionada (22/10/2026)

Continuação do Prompt Mestre 01/04. Branch candidata `feat/vende-p01-correction-approval-fence-20261022`, PR #152. Preservar o pipeline C06 original e **não duplicar** billing, pagamento, reativação, assinatura, licença ou outbox. Contrato e evidências: `docs/governance/VENDE_P01_TWO_PERSON_CORRECTION_INTENT_2026-10-22.md`.

- Após risco financeiro canônico, exigir triagem escalada, observação financeira de fonte autenticada e status remoto de leitura assinada; nem eventos de risco nem ações humanas isoladas são autorização de refund ou alteração de licença.
- A preparação e segunda revisão são auditadas sem mutação contratual; dois atores corporativos distintos precisam reautenticar. Replays, versão divergente, estados expirados e concorrência são negados.
- A etapa separada `queue` exige **nova decisão expressa e step-up do segundo revisor**, `FM_COMMAND_VENDE_CORRECTION_EXECUTION_ENABLED=true` (sempre **OFF por padrão**) e o transporte C06 autenticado existente. Revalidar status remoto atual, plano/revisão/validade, fatura, PSP, cliente/assinatura e contrato antes de chamar `GovernedVendeC06Service.requestRegularization`.
- Uma admissão bem-sucedida cria somente `reactivation_pending` e `REACTIVATE_VERIFIED.pending` transacionais, com ID de operação determinístico baseado no `intentId`. O dispatcher C06 já existente é o único executor remoto autorizado; ele é OFF por padrão e usa status assinado, one-shot, readback e quarentena de incerteza.
- A rota FM de status de correção apenas lê o estado remoto assinadamente e revalida o PSP após a rede. Mesmo `assistant_active_payment_verified` **não** prova quota/entitlement efetivos no Core nem encerra o caso; `coreQuotaVerified=false`, `caseResolved=false`. Nenhum reembolso ou nova cobrança nasce dessa recuperação.
- Gates no **HEAD exato**, testes PostgreSQL descartáveis incluindo dupla aprovação, concorrência de reativação, reversão financeira posterior, check de status remoto, lint/typecheck/build/E2E, revisão independente humana e CI pós-merge obrigatórios. CI que não executou todos os passos não é GREEN. Nenhum deploy, migração operacional, segredo real ou homologação externa antes do software 100% construído.

### F3/P01 — Reconciliação de licença e quotas do Core (22/10/2026)

Preservar o trabalho da PR #150 em candidata atualizada baseada na main pós-merge #152; não recriar Core, Assistant, quotas, C06 ou billing. Documento de fonte de verdade: docs/governance/VENDE_F3_P01_LICENSE_CORE_RECONCILIATION_2026-10-22.md.

A autoridade da licença é o Assistant, a autoridade contratual é o Command e o ledger transacional de tokens/requests pertence ao Core. Após uma reativação assinada do Command, testar que o Core volta a conceder novas reservas apenas com grants frescos do Assistant, mantém as reservas anteriores e bloqueia novas reservas na suspensão, expiração da licença, falta de rede/assinatura, outro tenant ou unidade inválida. Texto e áudio compartilham o limite. Os cinco limites de IA devem respeitar o contrato do Core, com todas as funções disponíveis em cada plano.

Não elevar coreQuotaVerified para true no P01 baseado só em status do Assistant ou em testes sintéticos. Exige readback corporativo autenticado do Core e revalidação do estado atual. Merge apenas com todos os gates exatos certificados, auditoria interna aceita pelo proprietário, e branch protection respeitada. Pós-merge: main e CI.

### F3/P01 — readback efetivo de quotas no FM Core (22/10/2026)

A PR #153 integra os testes Command→Assistant→Core de suspensão, reativação, expiração e quotas compartilhadas. Esta PR conecta o fluxo de recuperação P01 ao Core por um endpoint corporativo HMAC S2S somente leitura (ver docs/governance/VENDE_P01_CORE_QUOTA_READBACK_2026-10-22.md e FM Core PR #3).

Somente após `assistant_active_payment_verified`, verificar no Core, para tenant canônico do comando C06 e unidade/capacidade explicitamente selecionadas, assinatura S2S independente, grant Assistant fresco, revisão do plano, limites e contadores do ledger Core. Revalidar Assistant e PSP após a chamada à rede. Não carregar segredos no browser, não usar dados de outro tenant nem confundir observação parcial por unidade com liberação de todo SaaS.

Não projetar política ou reservar consumo como efeito de consulta. A API e integração ficam OFF por padrão por FM_COMMAND_CORE_QUOTA_READBACK_ENABLED=false. Resultado positivo diz apenas `core_unit_policy_verified`, `caseResolved=false`, `allUnitsVerified=false` e `futureAiAdmissionGuaranteed=false`. O status global P01 mantém coreQuotaVerified=false quando não houver prova explicitamente consultada; nenhum fechamento automático.

Gates: HEAD exato, Foundation, PostgreSQL, F21, Cognitive no Command, Core 2/2 no branch original, revisão interna separada permitida pelo proprietário e CI pós-merge. A branch Core PR #1 permanece Draft; não usar essa evidência para afirmar ambiente externo homologado ou produto 100% pronto.
