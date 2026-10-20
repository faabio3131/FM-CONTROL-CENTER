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
