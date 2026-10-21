# FMCC — CHECKPOINT COMERCIAL (2026-10-19)
## O que foi feito nesta unidade
- Planejamento documental dos sete fluxos C00–C09, sem alterações de runtime/DB/credenciais.
- AGENTS.md novo na raiz para execução governada; pré-autorização condicionada de merge conforme instrução humana.
- Base observada da main: 18f1d1b2c9283fd7f775da97e3b7a74e3c767ada.
## Estado
- Documentos nesta branch: IMPLEMENTADOS; CI / revisão: PENDENTE (não declarar verde sem execução).
- C00: EM EXECUÇÃO (inventário inicial parcial); C01–C09: NÃO CERTIFICADOS. PR #90, #91, Assistant #1 e Kordena #230 permanecem segregadas com seus próprios gates.
- Não houve merge, deploy, migration, conta real, cobrança, ou teste externo nesta unidade.
## Primeiro próximo passo
Concluir C00 verificando o CURRENT nos repositórios/ambientes relevantes, mapa exato de source-of-truth, contratos de versionamento e estados; então prosseguir C01 reaproveitando PR #91. Se CI GitHub Actions iniciar com steps=0 ou runner=null, registrar BLOCKED_EXTERNAL e prosseguir atividades independentes sem alegar aprovação.
## Autorização
Execução de correção e merge de PR tecnicamente elegível com 100% dos gates executados e verdes, revisão e sem STOP. Não autoriza produção, pagamento, migrations operacionais, credencial real, mudança destrutiva ou publicação externa.

## Atualização C00 de 19/10/2026
- Matriz e gaps publicados em FMCC_C00_RECONCILIACAO_CONTRATOS_2026-10-19.md.
- Kordena mantém catálogo comercial autoritativo e Budget Ledger de IA; Command utiliza controle versionado sem criar segunda fonte de verdade.
- PR #91: três gates consultados SUCCESS no SHA 7fde1e1c; revisão completa pendente.
- C00 PARCIAL; C01 na candidata PR #91. Sem merge, deploy ou dados financeiros reais.

## Atualização factual de 2026-10-20 — reconciliação com execução real
**FATO / CURRENT (GitHub consultado)**
- PR Kordena #230 integrada à `staging/kordena-premium` no commit `b6f39246d27492014dd4998c5d19cef1392af91f` após 20/20 workflows verdes no último HEAD da PR.
- PR de reconciliação Kordena #231 integrada na mesma staging no commit `8f0f839a03a2a4527b212b125be2093122788c23`. SHA candidato `1e224fc246b6ebc7522807e0035dc21e25533e69`: 11/11 workflows SUCCESS, 0 falhas. Pós-merge: Vercel e dois status Railway SUCCESS; **não houve workflow GitHub Actions associado diretamente ao SHA de merge**.
- A relação de ancestralidade Kordena `main..staging/kordena-premium` agora é `ahead=1236, behind=0`; não significa que staging foi promovida para a main.
- PR FMCC #91, editor governado de preços/limites Kordena, integrada à main em `6c0b9d31381a4685aecfe491e267ad76c52fdeb7`. No HEAD da PR `7fde1e1c95d7e77547e5b6f088939311be06518f`, 3/3 workflows SUCCESS. A implementação na main não prova que a versão está publicada no Render/preview; não foram definidos valores reais de preços ou limites.
- Esta atualização não declara integração E2E do Command em runtime com o backend Kordena real, migrações reais, habilitação de quotas em produção, cobrança, homologação externa nem disponibilização comercial.

**FASES E PENDÊNCIAS**
- C00: reconciliação documental em andamento; fontes de autoridade Kordena vs billing FMCC continuam segmentadas. Exigir evidência de contrato interproduto e credenciais configuradas somente na etapa apropriada.
- C01: editor e enforcement foram **implementados e integrados em código nas respectivas branches**; testes pré-merge aprovados. Runtime conjunto, segurança cross-product e homologação permanecem NÃO CERTIFICADOS.
- C02–C09: não declarar concluídas sem respectivos gates e evidências. Recuperar progresso existente antes de implementar.
- Sem produção deliberada nesta unidade, migração de banco real, configuração de preço ou credenciais reais pelo executor.
- Próximo passo: comprovar no ambiente de prévia FMCC qual commit é servido, testar jornada de configuração Command → plataforma comercial Kordena em ambiente controlado e continuar cronograma C02 sem confundir homologação externa com construção.

## Checkout e inventário antirretrabalho — C01, 20/10/2026
**DECISÃO posterior:** executar checkout/preflight de branch/SHA e verificar código + PRs + interfaces + contratos + runtime antes de abrir implementação. Prioridade é terminar construção e integração interna; homologação externa/publicação são gates posteriores. Não interpretar isso como autorização para bypass, merge sem gates ou publicação.

**Repositórios/SHAs examinados:** FMCC main d9bcc38ef40188998bf78d165d688417addd4f9b; IRON backend main 36ea0432d1069ee1ab37ebd774bdc7e8af6343b2; PR FMCC #94 de C01 em reconciliação com main; IRON PR #142 de contrato S2S de planos publicados. Checkout local direto não disponível no executor (DNS GitHub indisponível); acesso remoto ao conteúdo e SHA foi verificado via GitHub App, sem alterar trabalho local.

**JÁ EXISTENTE — NÃO RECONSTRUIR**
- C01 Kordena: editor de preços/quotas governado PR #91 na main FMCC; catálogo canônico de planos/preços é da vertical Kordena.
- C01 IRON: FMCC usa fmcc_billing_product_plan, API de produto/planos, step-up e SourceRegistry; IRON backend já possui ProductPlan/ProductPlanVersion, publicação e entitlements como autoridade, com mutações SUPER_ADMIN. Não criar tabela ou engine paralela.
- C02: tabelas FMCC customer, binding, subscription e invoice e POST /api/billing/products/[productId]/prepare já criam vínculos e faturas idempotentes sob constraints. A PR #96 (separada) entrega leitura das assinaturas; não recriar o domínio.
- C03: inbox, emissão/recuperação Asaas, reconciliação verificada, outbox e rotas IRON já têm implementações especializadas; verificar cobertura por SaaS antes de generalizar, sem contar gateway como homologado.
- C04: IRON tem lifecycle por comando autenticado; FMCC tem entrega de licenças IRON por outbox. PR #90 cobre identidades Core↔Assistant (outra autoridade); não copiar esse fluxo de identidade como integração financeira.
- C05: Kordena budget ledger/FinOps integrado somente na staging, não provar runtime pelo histórico. C07: Metric Engine FMCC existe; PR #95 adiciona IA IRON, sem inventar tokens/custos.
- C08: conectores Kordena/IRON já existem com escopo tenant, allowlist HTTPS e secretRef. Não duplicar os conectores nem tratar a existência do adapter como conexão real.

**LACUNA DE INTEGRAÇÃO RESOLVIDA EM CÓDIGO CANDIDATO (sem publicação)**
- PR IRON #142: GET /api/v1/control-plane/fmcc/plan-versions pela mesma guard S2S, retorna apenas versões PUBLISHED com limite e autoridade explícita; IRON S0 Quality Gate passou no SHA de42e6da71fb3d726b1d6383cc94c24a29c53fa0.
- PR FMCC #94: tela comercial passa a buscar esse contrato, apresentar escolhas canônicas de versões em português e registrar vínculo imutável apenas para plano comercial FM inativo. API revalida autorização por role/billing:write + password step-up e consulta novamente IRON na hora da escrita; se fonte/versão indisponível, incorreta ou truncada, falha fechada. Não ativa preço, licença, cobrança ou provider.
- A PR #94 partiu de baseline antiga; para não descartar as 18 mudanças posteriores da main, foi reconciliada por merge normal de dois pais no SHA 711cd30be1586a3ad82603eebb60178e09761396, preservando Kordena/editor/governança e IRON/C01. Comparação main..branch após merge: 13 ahead / 0 behind. Nada foi aplicado a main ou produção.

**PENDÊNCIAS / PRÓXIMO**
- Validar gates no SHA final após checkpoint, código cruzado IRON↔FMCC, negativa de catálogo inválido e regras de autorização; nenhuma homologação externa ocorreu.
- PR #95 modifica iron-commercial-connector.ts e precisa ser reconciliada com #94 antes de merge; preservar ambas as capacidades (plans + AI usage).
- C02 ainda precisa lifecycle e histórico completo; C03–C09 dependem de gates de construção e contratos, não reiniciar estruturas já construídas.
- O Render preview não pôde ser confirmado neste checkout; deploy/versionamento permanece não verificado. Não declarar publicado por commit no GitHub.

## Integração incremental C01 + C07 (sem retrabalho), 20/10/2026
- Preflight: FMCC main d9bcc38e; PR #94 f1a77945 (4/4 workflows SUCCESS), PR #95 447eb52a (2/2 SUCCESS), ambas Draft e não integradas. IRON #142 S0 aprovado, ainda Draft.
- Trabalho existente: control plane S2S autenticado IRON/Command; fonte tipada, tenant isolation, step-up comercial, catálogo de planos versionados, read-model de execuções IA por academia/capability. Nada disso foi reconstruído.
- Integração incremental: merge com ambos os ancestrais (#94 + #95) com publishedPlanVersions() e aiUsage() preservados no mesmo IronCommercialConnector, UI do produto + subpágina IA; mantém testes originais e inclui regressão simultânea dos contratos. Não inventar tokens ou custos.
- Runtime separado: banco de preview Render fmcc-preview-postgres expirado/suspenso. Usuário prevê restaurar e fazer deploy amanhã. Proibido migrar/trocar banco/configurar credenciais ou publicar neste WP.
- Pendências: gates no SHA final, revisão e merge governado, integração segura da IRON PR #142 e da FMCC PR #94 antes de promover C07. PR #96 C02 tem 4/4 workflows no SHA anterior, mas C02 lifecycle completo não está certificado.

## Continuidade de construção — 20/10/2026, C02 (PR #96)
**DECISÃO humana posterior:** priorizar conclusão da CONSTRUÇÃO e integração interna dos blocos do Command antes da campanha final de TESTES / CERTIFICAÇÃO / HOMOLOGAÇÃO. Isso não autoriza produção, migrações reais, cobrança, acesso cross-tenant ou a alegação de que trabalho não testado passou. Verificações automatizadas acionadas pelo GitHub seguem registradas como evidência parcial, não homologação final.

**FATO / CURRENT:**
- Baseline da main na entrada: d9bcc38ef40188998bf78d165d688417addd4f9b, com PR #91 (editor Kordena) e PR #93 (cronograma e governança) já incorporadas.
- PR #94 (C01 planos/preços IRON), PR #95 (C07 leitura IA IRON) e PR #90 (identidades Command/Core/Assistant) permanecem separadas, não integradas. Evitar duplicar suas implementações.
- PR #96: nova capacidade C02 de consulta somente leitura, sem mutation, migrations, deploy ou gateway. Utiliza fmcc_billing_subscription e fmcc_billing_customer_binding existentes para exibir assinaturas internas no Command.
- API GET /api/billing/subscriptions: autenticação server-side, RBAC billing:read, produto autorizado validado no servidor, filtro tenant derivado da identidade, listagem limitada a 100 (+1 para detectar truncamento), resposta no-store e estado indisponível em erros.
- UI /dashboard/subscriptions: tabela PT-BR com assinatura, produto, cliente FMCC, externalTenantId, plano, status e data; explicitamente distinta das métricas externas MRR/ARR. Banco indisponível != lista vazia; página parcial != base completa.
- Unit tests do serviço e dos escopos foram adicionados ao código, mas gates completos e homologação seguem como evidência a verificar no SHA definitivo.

**PENDENTE:** C02 ainda não oferece cadastro/transição de assinatura, estados/reconciliação, histórico completo ou vínculo externo autenticado; essas entregas continuam planejadas e não podem ser marcadas 100%. C01 tem escopo IRON adicional em PR #94, C07 em PR #95 e ponte de identidades em PR #90. Validar CI/build/tests internos pertinentes antes de qualquer integração do branch; campanha de certificação final e homologação externa após construção integral.

**Próxima construção:** conferir a autoridade canônica do vínculo cliente→produto→plano e completar o domínio e as APIs governadas de lifecycle sem misturar contratos FMCC com cobranças internas dos SaaS.

## C02 — construção incremental dos vínculos de clientes (20/10/2026)
- Inspeção de main e PR #96 confirmou tabelas billingCustomers e billingCustomerBindings, com chaves únicas tenant+customer, tenant+product+externalTenant; NÃO criar cadastro duplicado.
- Incremento C02 nesta PR: leitura somente de vínculos cliente→SaaS por tenant da identidade assinada; join composto com tenant em ambos os lados, filtro de produto autorizado, limite 100 e truncamento; API no-store e UI PT-BR integrada à página Clientes existente.
- Sem mutações, cobranças, novos dados ou migration. Ausência de banco mostra indisponível, não zero; tenant externo é identificador, não autoridade para consultas cross-tenant.
- Pendência C02: transições do ciclo de assinatura, histórico e confirmação comercial ainda dependem de invariantes/estado existentes; não declarar C02 concluído só por duas telas de leitura. Testes internos no SHA final a conferir.

## C01/C02/C07 — candidato de integração de construção (20/10/2026)
- Branch candidata combina os HEADs preservados: #94 + #95 via PR #97 (e92c60f4, Cognitive Gate SUCCESS) e #96 (dd208341, 4/4 workflows SUCCESS).
- Todas as alterações de implementação são aditivas ou independentes exceto checkpoint documental, reconciliado sem descarte. Um único merge futuro reduz risco de sobreposição de três PRs.
- Status atual: build-candidate, NÃO homologado, NÃO publicado; validar todos os gates no commit combinado e revisar segurança e contratos antes de merge. A publicação depende do PostgreSQL Render restaurado pelo proprietário e do preflight de backups/migrations.

## C02 — Rastro financeiro de assinatura, 20/10/2026
- Construído em PR empilhada sobre a candidata #98: leitura específica de assinatura interna, faturas e último estado local de pagamento pelo billing FMCC existente.
- Contrato GET /api/billing/subscriptions/[subscriptionId]/trace e tela /dashboard/subscriptions/[subscriptionId] acessível pela lista: tenant somente da identidade autenticada, billing:read, IDs UUID validados, tenant em todas as junções, fatura vinculada a subscription+product+customer, sem SQL dinâmico nem dados financeiros de outro tenant.
- Limitado a 50 faturas recentes (+1 marcador truncado), sem inventar histórico completo, dinheiro recebido, lucro ou autorização de licença. Ausência de pagamento registrado NÃO comprova ausência de cobrança no provedor.
- Não cria tables, migrations, job financeiro ou novas transitions; preserva idempotência e conciliação canônicas. Implementação e teste interno exigem gates no SHA final. Banco Render segue suspenso até recuperação humana.

## C03/C04 — Monitoramento somente leitura das filas financeiras (20/10/2026)
- Inventário confirmou tabelas existentes fmcc_billing_gateway_event e fmcc_billing_iron_entitlement_outbox, processadores, outbox, reconciliação e rotas protegidas. Nenhuma dessas estruturas foi reconstruída.
- Novo read-model operacional limitado a 40 eventos + 40 entregas (41 para sinalizar truncamento); evita contagens globais falsas e não apresenta evento de webhook como confirmação financeira.
- API GET /api/billing/operations, UI /dashboard/billing/operations em português com link da área Operações, RBAC billing:read, escopo tenant da identidade, cache no-store, sinalização de banco indisponível, nenhuma mutação.
- PENDÊNCIA: prova de reconciliação com provider externo, workers ativos e homologação de runtime continuam separados do código; não habilitar cobranças/licenças nem forçar jobs. CI do SHA candidato pendente de execução.
## C06 — Prévia determinística do ciclo contratual (20/10/2026)
- BASE: PR #100 f702561b371f09719822563e2510e475472425d2; C02 #98/#99 e C03 #100 existentes em branches, nao em main.
- Autoridades: assinatura FMCC local e comprovacao financeira somente por reconciliacao de gateway; estado local nao constitui pagamento ou entitlement.
- Entrega: domain policy versionada fmcc.c06.lifecycle-preview.v1 e API GET read-only usando a mesma leitura C02, com RBAC, tenant da sessao e tratamento de dados incompletos/estorno.
- Estados candidate_for_review nao autorizam execucao (executionAuthorized=false): cancelamento, inadimplencia, reativacao, renovacao, migracao e conversao de trial. Policy nao infere trial, data de vigencia ou prorata.
- Alternativa rejeitada: mutacao direta de assinatura sem politica comercial aprovada, historico transacional, periodo efetivo e provas de provider/ack. Contratos e executor futuro exigem step-up, fingerprint, idempotencia, auditoria, outbox, versionamento e recuperacao.
- C06 AINDA PENDENTE: executor transacional governado, eficacia das mudancas e testes posteriores. Nenhuma migration real, cobranca, deploy ou ativacao.
## C06 — Registro governado de intenções contratuais (20/10/2026)
- Preflight: main d9bcc38e; PR #101 em 608e750d9; este incremento deriva de #101, sem reconstruir billing ou criar migrations.
- Implementado: preview de cinco minutos vinculado a ator, tenant, assinatura, estado e amostra financeira; token aleatório armazenado apenas como SHA256, único uso; ID de idempotência com hash escopado; transação PostgreSQL e locks para concorrência.
- POST de preview e POST de registro requerem identidade autorizada; operação final exige owner/admin, billing:write, senha validada no step-up, comparação de ator e confirmação explícita na UI.
- Persistência: eventos imutáveis na auditoria existente, com estado awaiting_policy. **Não é fila executável e não equivale à autorização para modificar assinatura.** Ausência de tabela nova intencional. Auditoria registra somente metadados mínimos; não armazena senha ou token claro.
- O histórico de faturas é limitado; casos truncados bloqueiam a intenção. Estorno registrado bloqueia candidaturas pertinentes. Revalidação ocorre no momento de registrar intenção; qualquer futuro executor deve revalidar ainda sob lock e verificar autoridade financeira original.
- Pendência C06: definir/aprovar políticas de vigência, prorrata, tolerância e estorno; criar ledger/eventos de transição, executor transacional próprio, outbox/ack e confirmação de estado antes de alterar dinheiro/licenças. Esta PR não executa tais mutações.
- Gates no SHA final pendentes. Render PostgreSQL permanece intocado, sem deploy nem homologação externa.

## C06 — Fila administrativa de revisão, PR #103, 20/10/2026
- Preflight: main d9bcc38e; #102 HEAD 7cc11683 (2/2 CI GREEN) base desta branch, sem merge. Work Packages C02/C03/C06 continuam em construção, #98–#102 empilhadas.
- Já existe o registro imutável \`billing.lifecycle.intent_recorded\` na tabela \`fmcc_audit_event\`; a nova fila usa essa autoridade sem criar tabela, ledger financeiro ou serviço paralelo.
- GET /api/billing/lifecycle-reviews lista até 50 (+1 para truncamento), restrita a owner/admin com billing:write e tenant da sessão. Estados são derivados da auditoria, não representam autorização.
- POST /api/billing/lifecycle-reviews/[intentId]/reject exige step-up e confirmação; insere decisão imutável com motivo codificado, idempotência e locks serializados por tenant. Sem mutação de assinatura, receita, gateway, outbox ou direitos.
- Limites: não existe aprovação/executor de cancelamento/renovação sem política aprovada de vigência, tolerância, prorrata e estorno. STOP na operação afetada; não impedir código interno independente. Nenhum deploy, banco Render ou migration real.
- Validar CI no SHA definitivo, testes PostgreSQL de concorrência/cross-tenant/replay e revisão aplicável. Status da candidata: não integrada/não homologada.

## C06/C08 — Prerequisitos de executor e contrato IRON em 20/10/2026
- Base #104 em 8da1b2da, 6/6 workflows verdes no SHA, não mergeada. main d9bcc38e.
- IRON #142 responde catálogo PUBLISHED, mas podia produzir published_at:null; parser FMCC exige ISO e falha fechado. IRON #143 em Draft corrige origem, gate e integração ainda pendentes.
- Novo contrato fmcc.c06.execution-prerequisites.v1 valida autoridade por ação, tenant, produto, assinatura, data, revisão e origem. Endpoint GET e UI de pendências usam dados server-side, nunca confiam em flags de aprovação do cliente.
- PENDÊNCIA humana: vigência, política de cancelamento, renovação, prorrata, tolerância, trial e refund. Nenhum executor financeiro ativado. Nenhuma migration, deploy ou banco real alterado.

## C01/C08 — Teste isolado do limite S2S FMCC ⇄ IRON, 20/10/2026
- Preflight: FMCC PR #106 HEAD c36f5827f1b91c1bb5187676f8a0fe5bcdb2739d 6/6 CI SUCCESS, ainda sem merge. IRON #144 HEAD 97ac245f7795d585693badb1149468aae513aebd S0 SUCCESS, ainda sem merge.
- Novo teste FMCC executa IronCommercialConnector real com fetch/provider guard sintético e resposta contratual IRON, verifica Bearer server-side, correlação, escopo tenant, source e HTTPS allowlist, 401, 503, metadados inválidos e status indisponível nunca convertido em catálogo vazio.
- Novo teste IRON (PR #145 / candidata #146) executa classe compilada FmCommandControlPlaneService e FmCommandControlPlaneGuard com Prisma fictício e token descartável. Testes independentes verificam os dois lados, mas **não são E2E entre serviços vivos**. Não declarar certificado cross-repo real antes de executar ambos em rede isolada e validar versões exatas.
- Dados de teste são sintéticos; sem credenciais reais, gateway, cobrança, migrations operacionais, deploy ou alteração do banco Render. Verificar CI dos novos commits e revisão aplicável antes de integração.

## C08 — Matriz de prontidão por SaaS (20/10/2026, candidata)
- **Preflight:** candidato FMCC #108 em `3a3ec13312b8a60cd9936c915fff978981e03ec4`, 5/5 CI SUCCESS, Ready for Review, sem merge; `main` `d9bcc38e` na última comparação; IRON #146 S0 SUCCESS, Ready for Review sem merge.
- **Novo incremento:** `fmcc.c08.integration-readiness.v1` deriva estados por produto ativo e fonte vinculada ao tenant autenticado, usando Source Registry e histórico operacional de sync já existentes. Não cria conector, tabela, migration, serviço de origem ou credencial.
- **Semântica segura:** `not_configured`, `unverified`, `persisted_unavailable`, `sync_running`, `sync_failed`, `freshness_undefined`, `sync_stale`, `sync_recent`. Saúde persistida não tem timestamp de auditoria nesta fonte; mesmo sync recente só comprova evento local, não E2E autenticado entre sistemas. `certifiedIntegrations=null`, `authenticatedSaasE2eCertified=false` e `externallyHomologated=false` **por desenho**, não como juízo de indisponibilidade real.
- **Segurança:** página existente `/dashboard/sources` aplica identidade + `source:read`, obtém produtos/fontes/sync por tenant, mostra apenas metadados sem `secretRef`, credenciais ou tokens; ignora registros cross-tenant e fontes desvinculadas. Testes negativos de tenant, produto, freshness e timestamps futuros incluídos.
- **Aceite C08 ainda PENDENTE:** matriz real de versões e E2E dos SaaS Kordena/IRON/Assistant/VendeAtendeIA, contratos de entrega/ack/quotas em ambientes isolados, recuperação do PostgreSQL Render e homologação externa posterior. A matriz não prova conexão real.
- **Governança:** CI no SHA desta branch e revisão ainda a executar; sem merge, deploy, migration operacional ou mudança financeira.

### Complemento C08 — contrato de consulta governado para Command/Core
- GET `/api/integrations/readiness` chama os repositórios tipados de produtos/fontes e histórico local por tenant de sessão assinada, com `source:read` + `product:read` verificados no servidor.
- `Cache-Control: no-store`, 401/403/503 sem expor detalhes; falha de banco ou mais de 256 registros sem paginação é indisponível, nunca lista completa fictícia.
- Resposta não inclui source secretRef, baseUrl ou payload privado; itens com tenant cruzado são ignorados. O contrato fornece leitura operacional, não autorização para Core executar ações.
- Testes negativos de RBAC, cross-tenant, limite, ausência de segredo e assinatura da API estão no candidato. Revisão/CI no SHA definitivo pendentes.


## C08 — Diagnóstico operacional orientado por evidências (20/10/2026, candidata incremental)
- Base: PR #109 HEAD `0280b8f134beb1bec5df70379e06a39d4511c822` (4/4 GitHub check-runs SUCCESS no SHA). Main `d9bcc38ef40188998bf78d165d688417addd4f9b`. Nova branch incremental preserva integralmente a candidata anterior.
- Contrato `fmcc.c08.integration-readiness.v1` ampliado apenas de forma aditiva: `nextAction` baseado em estado persistido e `localSummary` com contadores de fontes/sync **locais**. Recomendações são texto para operador, nunca comando ou permissão.
- A UI em português indica próxima verificação por SaaS, distingue saúde configurada/degradada mesmo quando houve sync e explicita que os contadores não são conexões E2E certificadas.
- Testes unitários acrescentados para falha/running/atualidade/saúde, segredo ausente da resposta, cross-tenant e RBAC preexistentes preservados. Sem novas tabelas, migrations, conectores, secrets, cobranças ou deploy.
- Estado: candidata de CONSTRUÇÃO; validações no novo SHA, auditoria independente e integração real entre versões publicadas dos SaaS pendentes. C08 não encerrada nem homologada.

### Encaminhamento de CI e revisão — PR #110
- PR #110 (`feat/fmcc-c08-operator-next-actions-20261020`) tem base `main` para certificar o conjunto acumulado e o incremento, preservando a PR #109 como checkpoint. Não aplicar dois merges do mesmo código.
- Cabeçalho do incremento anterior `b7038a77a29bef570aa6dbd42f588563f2655e87`. A verificação de CI deve ser refeita no HEAD resultante desta atualização documental. Resultado dos gates não deve ser antecipado.
- Certificação de comunicação E2E real entre FMCC, IRON, Kordena, Assistant/VendeAtendeIA e as decisões comerciais C06 continuam pendentes e segregadas das validações internas.


## Reconciliação pós-merge comercial × F3 Command/Assistant (candidata)
- CURRENT de entrada 2026-10-20: `main@7230f209f146807b8243834fc728544b1f471744` após PR #110 (52 commits adicionais e 4/4 workflows verdes no HEAD candidato). PR #90 `e5d20529b462d59ad0edfbf9dc590189d61aa5e7` tem 65 arquivos de diff e 4/4 checks SUCCESS no seu HEAD original, mas não estava integrada à main.
- Branch de reconciliação `reconcile/fmcc-commercial-f3-bridge-20261020`: união dos commits via merge de dois pais, preservando todas as 65 alterações da PR #90 e as 71 alterações comerciais da PR #110. Somente 3 caminhos se sobrepõem: workflow PostgreSQL (C06 e Vende outbox), página de produto (IRON consumo IA + Assistant planos) e teste de acesso a rotas (ambos). Nenhum contrato financeiro foi convertido em autorização fictícia.
- Após este commit de reconciliação: CI precisa executar Foundation, Cognitive, F21 e PostgreSQL isolado NO SHA DO MERGE; revisão técnica de diff/segurança, gate de migrações descartáveis e revisão independente proporcional permanecem obrigatórios antes de promoção. `main` não é alterada por esta candidata; sem credenciais, workers reais, migrations operacionais ou deploy.
- PR #62 antiga de billing possui gate cognitivo FAILURE em seu HEAD e mudanças arquiteturais paralelas; não mesclar indiscriminadamente. #73 possui edição de interface antiga superada por implementação posterior; preservar atual. #89 documento de reconciliação de evidências históricas pode ser integrado separadamente como registro datado.

## Reconciliação de PRs autorizada — 20/10/2026
- Merge comercial integrado via PR #110, SHA main `7230f209f146807b8243834fc728544b1f471744`, 4/4 workflows SUCCESS no HEAD `795c5ebee981f7e4fd97dbea8085a17dbf162af8`.
- PRs empilhadas comerciais anteriores já pertenciam à ancestralidade do merge; oito foram fechadas como incorporadas por ancestralidade, com comentários rastreáveis. Não repetir merges.
- F3 Core↔Assistant, outbox e worker VendeAtendeIA reconciliados com a main comercial, PR #111, merge SHA `ad1f9c949e7db44eee3f2823cd68a263a5daa3fc`. Commit candidato `6770c8574e211f6b886db3716237b4270fc53481`: Foundation, Cognitive, F21, PostgreSQL isolado 4/4 SUCCESS; validação CI pós-merge deve ser registrada à parte.
- PR #90 coberta pela ancestralidade da #111, sem reaplicar branch antiga. Workers/credenciais reais, migrations operacionais, produção e homologação externa continuam pendentes, não ativados pelo merge.
- PR #73 de UI encerrada por subsunção comprovada na main, que já contém todos os estilos compactos com evolução posterior. PR #62 permanece em Draft/STOP de integração por divergência arquitetural de billing e `cognitive-governed FAILURE` no SHA original, sem forçar merge.
- PR #89 guarda evidência financeira datada de 15/10: integrar como documento histórico e nunca como CURRENT da data atual. C06 continua aguardando políticas comerciais aprovadas.


## C08 — Resiliência do read-model de sincronização (incremento 2026-10-20)
- **Base factual:** main `6c00453e0c7b28250b2d8132589f1d3b22e0a54a`, pós-merge #112. Foundation e F21 pós-merge SUCCESS; o Preview Deployment Gate seguia em execução na consulta inicial, não equiparado a publicação.
- **Problema:** API `/api/integrations/readiness` e página `/dashboard/sources` usavam `Promise.all` sem limitação para até 256 consultas de sync; página não limitava a quantidade de registros nem revalidava tenant antes de formar os controles.
- **Mudança candidata:** helper compartilhado, no máximo 8 leituras simultâneas por lote; limite 256 sem truncamento, rejeição de IDs duplicados, exclusão defensiva de fontes cross-tenant, falha fechada quando há erro de sincronização. Mesma proteção na API e na UI existente. Sem alterar contrato externo ou transformar health em certificação.
- **Aceite:** testes unitários de concorrência, duplicata, fonte estrangeira, falha, snapshot e UI; lint, typecheck, build, regressão, segurança e demais gates da PR no SHA exato. Estado deste registro: construção candidata; registrar merge e pós-merge somente após CI/revisão.
- **Impacto:** não adiciona tabelas, migrations, conectores, credenciais, gateway, workers ou operações financeiras. Rollback de código pelo histórico Git, preservando dados. C08/E2E externo e política C06 seguem pendentes.

## C08 — Catálogo padronizado de adaptadores, 20/10/2026 (candidata)
- BASE CURRENT: `main@a6f879d58c7f525160ee859a9128ac7945d35ab1` após PR #113. Foundation/F21 pós-merge SUCCESS; Preview Deployment Gate não certificado nesta observação. PR #62 permanece legada/bloqueada.
- Problema: o formulário de fontes e o backend repetiam metadados de Kordena/IRON. Novos SaaS precisariam duplicar regras de cadastro e segurança.
- Incremento C08: catálogo `saas-adapter-profiles.ts` centraliza os perfis de adaptadores de fato implementados; o backend reutiliza a mesma definição na validação de produto, sourceType, mapeamento, modo e secretRef, e a interface apresenta apenas adaptadores implementados e produtos sem adaptador. API de prontidão adiciona `supportedAdapters` público sem URL nem secretRef. Compatibilidade com Source Registry mantida; nenhuma conexão remota é afirmada.
- Testes acrescentados: paridade Kordena/IRON, segregação e binding, fixture de SaaS futuro, resposta sanitizada, RBAC preservado. Testes/CI no HEAD definitivo pendentes até aprovação dos workflows. Runbook em `docs/architecture/FMCC_SAAS_ONBOARDING_ADAPTER_RUNBOOK_v1.md`.
- SEGREGAÇÃO: `adapter_implemented_not_connected` não significa E2E homologado. O SaaS futuro ainda precisa implementar ConnectorRuntime, contrato, versão, identidade S2S, anti-replay, ack, reconciliação e provas isoladas. Nenhuma migration, novo gateway, credencial, worker, publicação, deploy ou operação financeira.
- Gate: revisar diff/segurança, lint, types, unit/contratos, integração, E2E, F21/Cognitive conforme CI; merge da própria etapa no SHA certificado, verificar `main` pós-merge. Não avançar em PR empilhada.

## C08 — Gate de pré-admissão de SaaS, candidato 20/10/2026
- Base `main@c68053c2219a512b3aeb24c39618fe6cb65f65f1` após PR #115; o Foundation/F21 pós-merge foi verificado verde. Preview cancelado, não é evidência de deploy.
- Contrato separado `fmcc.c08.adapter-preflight.v1`, exclusivamente local e read-only: distingue `adapter_missing`, `source_missing`, `binding_mismatch` e `local_contract_ready` por tenant/produto/fonte, usando perfis e Source Registry canônicos, sem consultar URL/segredo/serviço externo.
- API C08 apenas acrescenta `adapterPreflight`, sem alterar o contrato `fmcc.c08.integration-readiness.v1` ou sua semântica de `nextAction`; a UI passa a mostrar a incompatibilidade local como primeiro gate, sem afirmar E2E. Testes negativos para mismatch de credencial, produto externo, drift, capacidade e fixture de novo SaaS.
- ESTADO CANDIDATO; CI do SHA exato, revisão técnica e merge ainda exigidos. Sem migrations, worker, provider, billing, pagamento, deploy ou segredo real. Próxima dependência: contrato autenticado de handshake/receipts em gate C04–C08 específico com revisão de segurança independente; implementação local NÃO significa conexão real.

## C06 — Contratos, feriados FM e executor transacional interno (20/10/2026)
- Ramo isolado `feat/c06-vende-terms-calendar-execution-v1-20261020` nasceu da `main` conferida e reusa **exatamente** a política humana V1 da PR #122 (códigos puros versionados), sem mexer em IRON ou Kordena. PR #122 continua aguardando revisão independente: reconciliar ancestralidade/conteúdo antes de qualquer merge e NÃO declarar políticas duplicadas como entregas independentes.
- Migration aditiva `0015_vende_commercial_terms_calendar`: contrato Vende vigente/versionado com `effective_from`, `paid_through`, `due_date` civil date BR e fonte auditada; calendário FM com feriados/jurisdição e revisões imutáveis; log append-only de alteração de contrato; ledger de observações independentes do gateway; fila idempotente de comandos de licença. Nunca inferir vencimento de `invoice.created_at`.
- `GovernedVendeC06Service` exige escopo FM corporate owner/admin commercial:write e `StepUpProof` do mesmo ator com idade <=5min, em chamadas *internas*, antes de persistir. `publishCalendar` exige fonte/revisão, região e cobertura exatas; `enrollPaidTerm` exige assinatura ativa, fatura realmente marcada paid e pagamento provider received no Command, com contrato revisado manualmente; `requestSuspension` compara revisão CAS, fatura unpaid, observação autenticada recente de conciliador, férias/feriados governados e data local D5 + 3 úteis COMPLETOS, além de destinatário SaaS canônico.
- `requestSuspension` grava **suspension_pending**, auditoria e `outbox.pending` no mesmo TX; `pending` NUNCA equivale a licença suspensa na vertical, ACK confirmado ou revogação efetiva no Core. O worker remoto deve ser construído para entrega assinada não-replay e reconciliação read-only; não realizar POST cego. A tabela de observações *não possui* entrada HTTP pública: um reconciliador autorizado deverá preenchê-la de forma verificável depois de provider GET real, sem interpretar webhook isolado como prova.
- Testes PostgreSQL descartáveis: escopo FM, step-up, calendário holiday, idempotência/revisão, pagamento não verificado, ata de aprovação, PSP attestation stale, corrida dupla concorrente, audit/outbox exatamente uma vez.
- Aprovado **somente planejamento de software**: migration nunca aplicada no banco persistente de produção, nenhum deploy, gateway/IA/Evolution reais, cobranças, alteração financeira nem suspensão remota de clientes. Gates no HEAD final, CI de migração + PostgreSQL, revisão independente e integração cross-repo ainda exigidos. Reativação, upgrade/downgrade, cancelamento efetivo e worker com confirmação S2S permanecem fases de implementação interna distintas, não homologação externa.

### C06 — API corporativa de calendário
`GET/POST /api/billing/products/[productId]/vende-calendar` foi adicionada para leitura limitada das revisões e publicação manual exclusivamente FM. POST exige sessão FM owner/admin commercial:write, senha da mesma conta revalidada via step-up, corpo com chaves estritamente enumeradas, fonte/revisão de calendário governadas e pré-auditoria antes de mutação. Feriados não são carregados automaticamente de fonte pública nem aceitos de cliente SaaS. GET limita 100 revisões, scoped por tenant/produto, sem armazenar credencial. Testes de spoofing cross-tenant, body inesperado, pré-audit fail-closed, ator diferente e ordem de auditoria.

### C06 — Entrada corporativa de termos e intenção de suspensão
`POST /api/billing/vende-contracts` foi construído com duas ações explicitamente enumeradas: `enroll_paid_term` e `request_delinquency_suspension`. Autentica sessão FM admin/owner, commercial:write, confirma senha do mesmo usuário, recusa corpos >8 KiB, campos estranhos, tenant/URL/provider status injetados, IDs inválidos, alterações sem fatura paga e comprovada e observação recente do gateway, e registra preaudit antes de qualquer transação. Retorno HTTP 202 informa contrato registrado ou comando `pending`, com `deliveryConfirmed:false`; não prova revogação efetiva. Tests com FakeServices somente verificam ingresso; testes PostgreSQL exercitam lógica canônica e corrida sem PSP real. Cálculo aprova data e feriados da FM, mas política/homologação PSP e controle do atual entitlement via Assistant continuam próximos WPs.


## C04 — Sincronização interna governada do limite QR FM→Assistant (20/10/2026)
- Base: `main` verificada; não alterar a PR #114 de guardas de pagamento em revisão. Branch isolada `feat/c04-command-assistant-signed-qr-policy-20261020`; Assistant contraparte ainda em Draft PR #1, sem merge/deploy.
- Fonte canônica: `fmcc_whatsapp_qr_display_policy` escopada à FM e produto `vendeatendeia`. `readForProjection` só retorna revisão real persistida, ator e timestamp de alteração; revision 0 (fallback de 45s) nunca é assinatura publicada.
- Servidor Command: assinatura HMAC com nonce novo, caminho `/internal/v1/command/whatsapp-qr/policy`, payload de produto/organização/ator/revisão/data/segundos. POST admin `/api/billing/products/[productId]/whatsapp-qr-policy/sync` exige sessão FM, commercial:write, mesmo ator validado por senha, corpo apenas com senha, preaudit antes da rede, HTTPS configurado e flag `FM_COMMAND_VENDE_QR_POLICY_SYNC_ENABLED=true`. O flag fica OFF em todos os ambientes reais nesta fase.
- Assistant contraparte: schema aditivo `20261020_0017`, nonce único existente, revisão monotônica, rejeição cross-org e provas adulteradas, página QR usa limite persistido e mantém primeiro instante do QR ao receber revisão mais restritiva. QR do provedor pode ter TTL menor; não o inventar.
- Retry: apenas gesto governado de *mesma revisão* é idempotente; sem reenvio automático depois de falha ambígua. Diferente de emissão de licença; não confundir os mecanismos.
- Adicionados testes de payload, HMAC, nonce, duração, flag OFF, estados remotos e contrato assinado. **CI, revisão independente e integração real ainda precisam ser certificados no HEAD definitivo**; sem domínio, VPS, segredos, Docker ativo ou homologação externa.


## F3 — Adversarial license+quota cross-runtime certification candidate (20/10/2026)
- Isolated branch `feat/f3-internal-core-assistant-license-audio-gate-20261020`, PR #119, from latest main, no mutation of billing schema, gateway or subscription lifecycle.
- Re-pin the Foundation cross-repo harness to Assistant `419bc942cc9dc02d9125288ec5200a76aaa52bc9` and Core `7154020f45da7b82f847b7644ebaeb73f0565b76` (functional commits individually 3/3 and 2/2 CI GREEN, respectively).
- Test `f3_command_license_quota_journey.py`: corporate signed binding gets confirmed only while current license is valid, subsequent signed status with distinct nonce returns `not_confirmed` after suspension, and Core signed grant request cannot make new quota reservation; previous uncertain reservation remains held and isolated.
- Core corrected transcription `router_factory` to accept and transmit the admitted fallback attempt count, and hardened provider usage exact token parsing (booleans/floats rejected). Synthetic audio test covers metering, no provider contact on revoke/oversize, uncertain fallback.
- **CI on PR #119 and independent security review required before merge.** External provider receipts, automatic financial lifecycle/revoke and entire F3 remain OPEN internal work; this evidence is not proof of 100% construction or real-provider/WhatsApp/VPS homologation.


## F3/F9 — Reconciliação da PR #114 contra main atual (20/10/2026)
- PR #114 original tinha 4/4 CI verde no HEAD `cf694dddf5cde31cb691ec9fa79fa06027d72254`, mas apresentou `mergeable=false` por conflito documental com avanço de `main`. Os dois blocos de produção (revalidação SQL canônica após HTTP 200 e seleção elegível antes do limite) e os dois novos testes PostgreSQL foram portados **sem reconstruir** os contratos prévios de licenças.
- Nova branch `feat/f3-reconcile-p114-reversal-guards-20261020` parte de `main`. Mantém registro histórico da PR #114; original não fechada nem mergeada, evitando perda de auditoria.
- Após ACK HTTP positivo, a mesma claim deve manter nonce, conferir sob transação PostgreSQL invoice paid, provider received, revisão publicada e CAS do registro, bloqueando em qualquer reversão; nunca declarar entregue sobre estado financeiro perdido. Eventual vínculo já aplicado no Assistant NÃO é automaticamente revogado por esse bloqueio; revogação governada e reconciliação remota continuam pendentes.
- Worker limitado só seleciona pendências atualmente elegíveis; revalidação de claim permanece transacional, e itens suspeitos ficam observáveis em fila para revisão, sem starve do lote.
- GATE: nova PR e matrix Foundation/BillingPG/F21/Cognitive no SHA exato + revisão adversarial independente. Sem segredo, migration, deploy, provider ou mudança de assinatura real. F3 e C06 permanecem BUILD_IN_PROGRESS.


## F3 — Emissor contratual de suspensão de segurança (20/10/2026)
- Branch `feat/f3-command-security-hold-signer-20261020` usa signer HMAC de produção isolado em TypeScript, protocolo `/internal/v1/command/assistant-plans/security-hold` e prova cruzada com `SignedLicenseSecurityHold` Python em SQLite descartável; integra HEAD do Assistant com migration 0018 e HEAD do Core FinOps.
- Payload assinado contém autoridade FM, tenant SaaS exato, ator, aprovação e step-up de 5min, plano/revisão, deadline esperado (CAS), identificador único e razão fixa `security_hold`. Não inventa dados de contrato vindos de usuário.
- **Somente construção interna do protocolo.** Não há rota acionável para suspender cliente no Command; exige readback autenticado da licença corrente, auditoria, step-up FM e reconciliação de ACK incerto antes de qualquer ação. Não modificar billing, pagamento, desconto, cobrança, renovação nem ativar flag/provider/segredo. Testes no Head e revisão adversarial ainda são gates a verificar; F3/C06 não certificados globalmente.

## 21/10/2026 — B0 unificado
Candidata única PR #124 reúne #118–#121, guardas de #114 via #120 e API
read-only ausente de #122. Mantém evolução #123/#124. Contratos pinados aos
HEADs certificados Assistant/Core; quatro gates internos no pós-merge; teste
externo Render exclusivamente manual. Inventário, auditoria, limitações e
rollback em `VENDE_B0_RECONCILIATION_2026-10-21.md`. CI final pendente; nenhum
merge ou encerramento de F3 presumido. Autonomia reafirmada pelo proprietário.

### B0 — integração e verificação pós-merge
PR #124 integrada em `2a041d282a0135c02a36daef53fcc6fb90100705`, depois de
4/4 gates SUCCESS no HEAD `840a7c8ae3680dadc9a78c41a7495f7a4f19bcdd`.
Corrigido contrato de recuperação Command/Core com dupla identidade; os sete
contratos no CI passaram. PRs #114/#118–#123 encerradas como substituídas.
Acompanhamento pós-merge detectou gatilho Cognitive ausente em main; correção
obrigatória desta unidade antes de declarar B0 encerrado. B1 ainda não certificado.

### B1.1 — histórico de observações de pagamento
B0 encerrado em `9b27fb0663c16d3d1d8d05cbe4addea1c91c38ea`, 4/4 gates pós-merge SUCCESS (evidência em VENDE_B0_RECONCILIATION_2026-10-21.md). Próxima unidade corrige a unicidade por pagamento que impedia reconciliações sucessivas: migração 0016 conserva registros, unicidade por tenant/fatura/pagamento/source_ref, sequência para desempate e leitura determinística nos fences comerciais. Testes PostgreSQL cobrem upgrade com dados em transação descartável, preservação, repetição/conflito da mesma observação e liquidação que impede suspensão antes da rede. Fonte antiga recebida tardiamente não supera evidência recente. CI da unidade ainda pendente; não declarar produtor PSP, compensação de corrida ou F3/F9 concluídos.

Rollback B1.1: manter delivery OFF; reverter código se necessário sem remover histórico nem recriar índice único por pagamento, pois múltiplas observações legítimas passariam a conflitar. Migração somente em PostgreSQL descartável nesta fase. Nenhum deploy ou banco real autorizado.

B1.1: primeira execução Billing PG `39540005986` detectou contador antigo fixado em 16 migrations, após aplicar corretamente a 17ª. Corrigido certificador para comparar quantidade, SHA-256 do SQL e timestamp ordenado de cada migration ao journal, além de presença do índice novo e ausência do legado. Falha preservada como evidência; novo HEAD exige nova execução verde.

### B1.1 integrada / B1.2 em validação
PR #127 integrada em `25b4f58a31ac9484624276aeb155a0942358505c`. HEAD `01f9ed223f6415a6d967333c4e3ed42302ecdc94`: quatro gates SUCCESS. Pós-merge: Foundation `39540656146`, Billing PG `39540656126`, F21 `39540656275`, Cognitive `39540656164`, todos SUCCESS.

B1.2 centraliza leitura de evidência fresca e determinística com vínculo tenant/fatura/conta/pagamento, bloqueando suspensão e regularização se a última observação apontar para outro pagamento. Não usa observação antiga como fallback. Estado local recebido/confirmado/revertido/desconhecido não sustenta unpaid. Testes reais PostgreSQL com dados sintéticos cobrem vínculo incorreto, ausência, conta estrangeira, prova recente divergente sobre prova antiga válida e bloqueio antes de HTTP, além das jornadas positivas existentes. TypeScript e lint locais aprovados; gates SQL da unidade pendentes.

Rollback: revert de código, mantendo migração 0016 e delivery OFF. Sem endpoint novo, migração adicional, segredo, deploy ou homologação externa. Ainda faltam produtor PSP autenticado, compensação do intervalo entre chamada remota e liquidação, snapshot contratual e lifecycle completo; B1/F3/F9 não encerrados.

### B1.2 integrada / B1.3 produtor PSP em certificação
PR #128 integrada em `f385d9eddd86374f3bfe62a08f60806ff813d7e5`. Pós-merge Foundation
39541645092, Billing PG 39541645055, F21 39541645101 e Cognitive 39541645086 SUCCESS.
B1.3 constrói associação FM do payer PSP, GET autenticado configurável por conta/ambiente/
secret_ref, ledger de tentativas e produtor de observações append-only. Invalidação antes
da rede, revalidação de snapshot, estado needs_attention, replay sem rede e quarentena
protegem contra prova velha e resposta tardia. Nenhum status financeiro/licença é alterado.
Migration 0017 somente em banco descartável; CI final ainda pendente. Fontes oficiais,
threat boundaries e rollback em docs/FMCC_VENDE_PAYMENT_READBACK.md. O marco global interno
permanece aberto; composição API/UI/scheduler e compensação comercial são próximas unidades.

### B1.3 integrada / B1.4 supervisão em certificação
PR #129 integrada em `a8ed1bf9e103d32e537a1c8bba76277269e81046`. HEAD certificado
`95092a99c88387de14a9e7ea39e34cc598e14f78`: Foundation 39544246450, Billing PG
39544246498, F21 39544246451 e Cognitive 39544246463 SUCCESS. Primeira execução
detectou retorno de needs_attention pelo leitor; corrigido para null fail-closed,
mantendo teste de quarentena/resposta tardia. Pós-merge: Foundation 39544577244,
Billing PG 39544577294, F21 39544577265 e Cognitive 39544577221 SUCCESS.
Autodeploy Render revalidado OFF antes do merge; nenhum provider real acessado.

B1.4 adiciona supervisão local limitada por fatura, API corporativa com validação
estrita e reautenticação, associação do payer e quarentena auditadas, consulta PSP
condicionada à flag do servidor e operação identificada sem retry automático. UI
não aceita prova financeira; recorded não significa paid. Testes de ingresso e
projeção PostgreSQL adicionados. CI do HEAD final ainda pendente. Rollback em
FMCC_VENDE_PAYMENT_READBACK.md. Lifecycle completo, scheduler e compensação de corrida
continuam abertos; F3/F9 e BUILD_COMPLETE_INTERNAL_GREEN não declarados concluídos.

### B1.4 integrada / B1.5 aprovação original em certificação
PR #130 integrada em `1bbf3ca6b54a9acbc35847546891369dde0f2169`. HEAD
`ba1027bc9884d9d4ad92b6a5700bb992a09aaed7`: Foundation 39545398683,
Billing PG 39545398732, F21 39545398783, Cognitive 39545398760 SUCCESS.
Pós-merge: Foundation 39545812758, Billing PG 39545812668, F21 39545812649,
Cognitive 39545812647 SUCCESS. Render autodeploy OFF revalidado antes do merge.

Revisão B1 detectou aprovação artificialmente recente no dispatcher C06: approvedAt
era now no envio. B1.5 persiste o StepUpProof original, bloqueia intent sem prova ou
com aprovação vencida/futura antes da rede e revalida antes da mutação. Migration
0018 preserva NULL legado não autorizante. Readback tardio continua sem reenvio.
Testes SQL adicionados; gates finais pendentes. Detalhes e rollback no runbook
FMCC_VENDE_C06_APPROVAL_FRESHNESS.md. Nenhuma ativação externa ou mudança de política.

### B1.5 integrada / B1.6 reaprovação supervisionada em certificação
PR #131 integrada em `d2bead865677c5318f947b9b15b8289bfb19934a`. HEAD
caace57edcdd7cf425f755642de514c01822ac74: Foundation 39546398150, Billing PG
39546398063, F21 39546398204 e Cognitive 39546398434 SUCCESS. Pós-merge:
Foundation 39546812827, Billing PG 39546812802, F21 39546812784 e Cognitive
39546812834 SUCCESS. Nenhum deploy/migration operacional/provider real.

B1.6 fecha a reaprovação humana de intents vencidos nunca tentados: API e painel FM,
step-up original, CAS, evidência financeira e contrato revalidados, vínculo SaaS exato,
auditoria append-only atômica e nenhuma rede/reset de estados incertos. Testes negativos,
concorrência e rollback por falha de auditoria adicionados. Gates finais pendentes.
Não declarar lifecycle completo ou BUILD_COMPLETE_INTERNAL_GREEN; permanecem snapshot
contratual, demais transições, compensação distribuída e módulos seguintes do cronograma.

### B1.6 integrada / B1.7 histórico contratual em certificação
PR #132 integrada em `20f2285d9f6d89fed1724454025752c848e16a1f`. HEAD
060182cb275ca5ff5abc5fb9209fad3229296d00: Foundation 39549090207, Billing PG
39549090231, F21 39549090257 e Cognitive 39549090282 SUCCESS. Pós-merge:
Foundation 39549554430, Billing PG 39549554434, F21 39549554443 e Cognitive
39549554572 SUCCESS. Render autodeploy OFF. Nenhuma ativação externa.

B1.7 captura termos before/after nas quatro mutações C06 e permite consulta corporativa
paginada no painel. Legado NULL permanece explicitamente incompleto; não inventar preço,
quota ou ACK. Migration aditiva 0019 e testes de isolamento/paginação/conservação adicionados.
Gates finais pendentes. Detalhes: FMCC_VENDE_CONTRACT_REVISION_HISTORY.md. Permanecem
transições comerciais restantes, snapshot comercial de preço/quotas e compensação distribuída;
não declarar B1/F3 ou SaaS 100% concluído.

### B1.7 integrada / B1.8 reativação em certificação
PR #133 integrada em `c04f73c6e54aeb939518faf98fd75af0ce8c2c71`. HEAD
ad93e1d18ac29920b42387ce948f80d1d27a0ae1: Foundation 39550742829, Billing PG
39550742833, F21 39550742849, Cognitive 39550742847 SUCCESS. Pós-merge:
Foundation 39551213484, Billing PG 39551213550, F21 39551213544, Cognitive
39551213507 SUCCESS. Fixture UUID/text corrigido antes da certificação, sem retirar gates.

B1.8 implementa entrega interna one-shot de REACTIVATE_VERIFIED, alvo persistido antes do
POST, período civil completo, ACK exato, fences financeiros e readback de outcome incerto.
Migration 0020 aditiva; nenhuma ativação, deploy, migration operacional ou provider real.
Gates finais pendentes; detalhes em FMCC_VENDE_REACTIVATION_DELIVERY.md. Próximo escopo:
reaprovação/supervisão comercial, demais transições e compensação. B1/F3 e produto global
continuam IN_PROGRESS, sem declaração BUILD_COMPLETE_INTERNAL_GREEN.

### B1.8 integrada / B1.9 reaprovação de reativação em validação (21/10/2026)
PR #134 integrada em main: `0bd8e0ddfdc523a9491eb758a38dbe811e7a85d9`.
HEAD de B1.8 `b474999484aa3d5cc86a0883fb066062dbfe0a42`: Foundation
39552101236, Billing PG 39552101180, F21 39552101215 e Cognitive 39552101219
SUCCESS. Pós-merge: Foundation 39592575782, Billing PG 39592575859,
F21 39592575826 e Cognitive 39592576268 SUCCESS. Nenhuma migration de produção,
credencial externa ou deploy intencional habilitado por esta entrega.

B1.9 trata exclusivamente reaprovação humana de REACTIVATE_VERIFIED pendente,
nunca tentada, após expiração da aprovação anterior. Reutiliza elegibilidade canônica
financeira/contratual B1.8; a UI e API B1.6 passam a aceitar ação discriminada,
sem refazer a fonte de verdade nem permitir cross-action. Testes de concurrency,
isolamento, estados incertos, target já fixo, pagamento/revisão e auditoria. B1.9
AINDA NÃO CERTIFICADO: CI no novo HEAD e auditoria ainda necessários.
Segue pendente o restante do ciclo comercial, supervisão/worker, compensação
financeira entre serviços e B2-B11; BUILD_COMPLETE_INTERNAL_GREEN NÃO concedido.

### B1.9 integrada / B1.10 supervisão C06 em certificação (21/10/2026)
PR #135 integrada em `174b92c922f9c53f73ab4cea73eff909ef15cc53`,
após 4/4 gates no HEAD `e4e5450dc5cd12faa88b2ffb954982904c3aa526`:
Foundation 39593694715, Billing PG 39593694558, F21 39593694504,
Cognitive 39593694594 SUCCESS. Pós-merge: Foundation 39594259138,
Billing PG 39594259108, F21 39594259120, Cognitive 39594259320 SUCCESS.
Sem deploy/credenciais reais/migration operacional. B1.9 certificado internamente.

B1.10 constrói visão somente leitura dos comandos C06: contadores integrais do
banco canônico, itens limitados a 50 com truncamento, status desconhecido explícito,
alerta de processing antigo e aprovação vencida; RBAC FM, isolamento tenant/produto,
sem mutate, scheduler ou retry. API/painel e teste PostgreSQL/route no candidato;
CI no HEAD ainda por certificar. Rollback em docs/FMCC_VENDE_C06_CLAIMS_MONITOR.md.
Depois: tratar compensação distribuída e demais transições comerciais, sem refazer
F0-F2/B0/B1.1–B1.9. F3/F9/B1 global continuam BUILD_IN_PROGRESS.

### B1.10 integrada / B1.11 risco de compensação em validação (21/10/2026)
PR #136 integrada em `9fdbe5b3f9999b059ce1dd91d84eccc69d8bc27a`.
Gates HEAD `90119e3fbf2eb08dfb6a2078d9925c5ff351f598`:
Foundation 39595483867, Billing PG 39595483705, F21 39595483646,
Cognitive 39595483662 SUCCESS. Gates pós-merge na main:
Foundation 39596152129, Billing PG 39596152307, F21 39596152264,
Cognitive 39596152280 SUCCESS. B1.10 GREEN_INTERNO.

B1.11 instrumenta ambas as transições C06 já implementadas para preservar
um único registro auditável de risco quando prova de operação aplicada no
Assistant não pode ser confirmada localmente pela situação financeira/contratual
atual. O comando permanece unknown, sem alterar licença, pagamento ou fazer retry.
Reaproveita a tabela de auditoria e o monitor B1.10, sem nova migration.
Testes PG sintéticos simulam refund após reativação remota, pagamento durante
suspensão remota, replay de reconciliação e ausência de efeitos automáticos.
CI no novo HEAD ainda PENDENTE nesta anotação: não declarar B1.11 concluído.
Reparação financeira/entitlement governada, reconciliação retroativa após delivered,
demais transições e cronograma B2–B11 continuam em aberto. Sem homologação externa.

### B1.11 integrada / B1.12 detecção financeira após delivered em certificação (21/10/2026)
PR #137 integrada em `55b73983ccd56530ab6d9ddc54328caf67a22e95`.
Gates do HEAD `7a1aecbc16f8081ff8cf329d49d5f1e41e99b6c3`:
Foundation 39610895752, Billing PG 39610895941, F21 39610896465,
Cognitive 39610895699 SUCCESS. Pós-merge: Foundation 39611621424,
Billing PG 39611621380, F21 39611621417, Cognitive 39611621373 SUCCESS.
B1.11 WP = GREEN_INTERNO. Sem deploy externo, migration operacional ou provider real.

B1.12: readback PSP corporativo já existente passa a identificar evidência
verificada de reversed pós-reativação delivered e settled pós-suspensão delivered,
mantendo auditoria única B1.11 por comando, sem confirmação do entitlement atual
nem operação compensatória automática. Checagem no mesmo TX da observação,
sem lock invertido na claim. Testes PG simulam ambos os casos, replays e controles.
CI nova unidade ainda a certificar. Demais transições contratuais/compensação
governada permanecem em aberto, B1/F3/F9 global NÃO concluídos.
