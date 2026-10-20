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
