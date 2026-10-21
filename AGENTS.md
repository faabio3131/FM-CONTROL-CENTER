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
