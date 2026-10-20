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
