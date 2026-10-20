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
