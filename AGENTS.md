# AGENTS.md — FM Command | Executor do Billing Central

> **Escopo:** somente o repositório `faabio3131/FM-CONTROL-CENTER`. Este documento é a ordem de execução técnica das pendências **1 a 6** do Billing Central.  
> **Estado:** plano de execução aprovado como diretriz; **não constitui autorização para merge, deploy, migração em produção, ativação de credenciais reais ou transferência de cobrança**.  
> **Branch de referência:** `feat/billing-central-foundation` — PR #62 (Draft).  
> **Integração correlata:** PR #58 do AtendeVendeIA, documental. Ler o ADR-0005 e `fmcc.license.v1` na revisão mais recente antes de fixar interfaces.

## 0. Missão e regra inegociável

Transformar o FM Command em **Billing Central multi-tenant, multi-produto e multi-gateway**, apto a gerenciar (A) mensalidades que assinantes dos SaaS da FM Tecnologia pagam **à própria FM** e (B) faturamento e assinaturas **dos clientes que compram o Command**, sob contas recebedoras e credenciais **deles**, sem jamais misturar os dois domínios financeiros.

O Command é o **control plane comercial e de licenças**; não é um banco, nem um processador de cartão. Provedores de pagamento liquidam valores nas contas recebedoras contratadas e configuradas por cada empresa. O Command atribui pagamentos por identificadores verificáveis, audita, reconcilia e determina licenças dos SaaS integrados.

Regras:
- O **billing tenant** identifica a empresa dona do faturamento. Identifique também produto, cliente, assinatura, licença, cobrança, transação, gateway account, provedor e referência externa. **E-mail nunca é chave canônica**.
- `customer_id`, `subscription_id`, `license_id`: identificadores UUIDv7 imutáveis emitidos pelo Command. Reutilizar o Product Registry atual; código técnico existente `IRON` continua canônico, enquanto **Iron Fit** é nome comercial. Evitar criar catálogos paralelos.
- Um cliente pode contratar vários SaaS. Cada produto e assinatura tem licença separada, mapeada ao tenant operacional do SaaS sem escrita direta no banco desse SaaS.
- Credenciais, contas de recebimento e operações dos tenants são isoladas; **nunca** roteie pagamentos de um cliente do Command para a conta da FM, exceto a própria **assinatura de uso do Command**, que pertence ao billing tenant da FM.
- Uma assinatura tem **uma única autoridade comercial** ativa. Cakto/Hotmart diretas do AtendeVendeIA permanecem como estão até migração por assinatura, com modo sombra, evidências e aprovação humana expressa.
- **Provedor configurável ≠ provedor arbitrário:** instalar/adicionar credenciais de um adaptador já homologado deve ser possível pela UI, sem alterar código; para novo provedor, desenvolver e homologar adaptador reutilizável. Nada de URL GET/POST arbitrária sem SSRF/egress policy, allowlist, autenticação e aprovação.
- Cada novo estágio deve ficar funcional e certificado em ambiente isolado antes do próximo. Não alegar certificação de integração real por testes unitários ou mock.

## 0.1. Procedimento obrigatório antes de codificar

1. Ler `README.md`, documentos FMCC-04/05/07/12, fonte financeira atual, `FMCC-09-ADDENDUM-KORDENA-GOVERNED-CAPABILITY-v0.1.md`, implementação de Kordena Billing Control, Source Registry, Canonical Facts, Metric Engine, RBAC, banco/Drizzle, fluxo de auditoria e PR #62. Conferir o estado atual da `main` e das migrações; **não confiar apenas neste texto**.
2. Produzir inventário “**EXISTE / PARCIAL / AUSENTE / INCOMPATÍVEL**” por requisito, indicando arquivo, classe e teste. Reusar componentes existentes e declarar lacunas sem inventar recursos.
3. Corrigir divergências já vistas na fundação: schema proposto ainda não foi exportado pelo `schema.ts` nem migrado; interfaces de gateway ainda não são integração real; funções de atribuição ainda não fazem persistência. Confirmar que não há outra implementação concorrente antes de adicionar tabelas.
4. Atualizar ADR específico no Command para **migração de autoridade comercial do Kordena**, sem alterar a autoridade nem os `entitlements` atuais. Revisar compatibilidade do contrato multi-produto com o AtendeVendeIA.
5. Manter branch/PR isolada; atualizar plano de execução, decisões, evidências e tracker por fase. Não executar etapas destrutivas ou externas sem aprovação.

## 1. Banco financeiro e integridade multi-tenant

**Objetivo:** persistência canônica transacional para:
`billing_tenant` (ou reutilizar identidade canônica de tenant do Command), produtos/planos, clientes, assinaturas, licenças, `gateway_account`, `invoice`, `payment`, `provider_event`, links externos, idempotência, ledger/eventos financeiros, reconciliation jobs, audit trail e transactional outbox.

**Implementação:**
- Esquema Drizzle com migração incremental versionada e reversibilidade planejada; **gerar SQL e testar em banco de teste efêmero**, sem aplicar no banco real. Respeitar o histórico de migrações do repositório.
- FKs **compostas com billing_tenant_id** em qualquer relação entre entidades comerciais; unique indexes por tenant/provedor/referência externa; checks para estado, moeda ISO, valor >= 0, período válido, sequência de versão e integridade de referências.
- Não usar `integer` estreito nem `number` de ponto flutuante para valores monetários grandes: escolher `bigint`/numeric exato com estratégia de precisão por moeda; separar faturado, autorizado, capturado, liquidado, estornado, repassado, tarifas e líquido. Não declarar `paid` equivalente a `settled`.
- Isolamento no serviço **e** no banco (RLS de segurança ou mecanismo transacional equivalente demonstrável), índices tenant-first, RBAC, controle de concorrência, locks/versionamento e transações atômicas. Nunca confiar no tenant vindo do body/header quando há contexto autenticado.
- Eventos recebidos idempotentes por `(billing_tenant_id,gateway_account_id,provider_event_id)`, com retenção e trilha de auditoria; quarentena persistida quando atribuição ou reconciliação divergem.
- Criar testes de isolamento cruzado FM × empresa externa, SaaS × SaaS, cliente × cliente, assinaturas diferentes, mesmo evento repetido, referências de mesmo ID em provedores distintos, chargeback/refund, concorrência e migrations up/down ou rollback documentado.

**Gate 1:** migration verificável em banco efêmero; consultas de outro tenant negadas; FKs e uniques impedem vínculos cruzados; sem migração de produção.

## 2. APIs autenticadas e configuração de gateways

**Objetivo:** administração por UI/API, sem edições de código por novo cliente.

**Implementação:**
- Endpoints REST ou padrão já existente: listar provedores homologados; listar/cadastrar/editar/testar/desativar contas de gateway; configurar modo sandbox/produção; métodos de cobrança suportados; conta recebedora; seleção principal/backup por produto/método, com roteamento seguro.
- Listar/consultar clientes, planos, assinaturas, licenças, invoices e pagamentos dentro do escopo. IDs emitidos pelo Command; impedir edição indevida de relações canônicas.
- Utilizar autorização **server-side** por tenant + `billing:read`/`billing:write` e aprovação adicional para ações sensíveis; nunca retornar segredo ou token, mesmo parcialmente por engano, em logs/JSON/erros.
- Credenciais no gerenciador de segredos/vault, **apenas referência** no banco; rotação, revogação, testes de conexão e audit trail. Validar payload por schema, limites, rate limiting, CSRF quando pertinente, autenticação do cliente e separação de ambientes.
- Para ações assíncronas usar jobs/outbox; separar testes de conexão de ativação de gateway. Nenhuma conta é validada apenas porque foi cadastrada.
- Garantir que **alterar configuração de tenant A não altera tenant B** nem a operação interna da FM.

**Gate 2:** testes de permissão negativa, tenant spoofing, segredo não exposto, rotação, endpoints e isolamento multiempresa. APIs desabilitadas ou sob feature flag até serem homologadas.

## 3. Integrações reais de provedores de pagamento

**Objetivo:** adaptadores reutilizáveis e **configuração por cliente**. Prioridade: Cakto e Hotmart (compatibilidade com AtendeVendeIA). Depois Asaas, Mercado Pago, PagBank, Stripe e demais, **sem presumir suporte até homologação individual**.

**Implementação:**
- Criar registro extensível de provedores/capabilities, não `switch` global hardcoded por empresa. Definir contratos tipados para checkout/cobrança/recorrência, consulta de pagamento, reembolso/estorno, notificações e conciliação, indicando capacidades não suportadas.
- Implementar verificação de webhook específica por provedor (HMAC, headers, timestamp, anti-replay conforme API oficial), rotação de segredo, decodificação segura, idempotência e comparação com resposta da API externa. **Webhook sozinho não autoriza crédito/licença**.
- `GET/POST` de configuração do usuário só aciona adaptadores homologados. Validar DNS/IP, bloquear destinos internos/metadata, controlar redirect, timeout, retries, backoff e rate limit. Nunca permitir SSRF ou cabeçalhos/credenciais livres arbitrários.
- Reconciliação externa verificará **provenance**, titularidade da conta recebedora, assinatura externa, invoice, moeda, valor, taxas e estado. Não criar uma recorrência nova ao importar uma já existente.
- Usar sandbox/homologação; não usar credenciais reais nem dinheiro de clientes até aprovação específica.

**Gate 3:** relatório por provedor com casos de sucesso e falha, webhooks adulterados, replay, chargeback, refund, duplicação, timeout, divergência de moeda e impossibilidade de cobrança duplicada.

## 4. Motor central de assinaturas, licenças e reconciliação

**Objetivo:** autoridade única comercial no Command, SaaS como consumidores.

**Implementação:**
- State machines explícitas e versionadas; full-state license snapshots, `license_version` monotônica, event_id e idempotência; validação de período, carência, suspensão, cancelamento, reembolso, recuperação e expiração.
- Contrato `fmcc.license.v1` multi-produto: emitir eventos assinados HMAC com `kid` e outbox durável/retry/DLQ; API autenticada de consulta individual, listagem incremental e **recuperação de autorização de provisionamento** quando o webhook se perde.
- Reconciliação a cada **15 min**, além de início e gaps; contingência de **até 72h** persistida e não reiniciável, que **nunca** reativa licença revogada. Nenhum LLM no caminho de decisão financeira determinística.
- Importação read-only de assinaturas existentes por `(provider,gateway_account_id,external_subscription_ref)`, com match auditável e revisão de ambiguidades (e-mail apenas contato).
- Transição: direct provider → shadow → dual-read/compare → aprovação humana registrada → **single-writer switch por assinatura** → monitoramento e rollback governado. **Nunca** duas autoridades comerciais ativas. A migração do Kordena exige ADR e plano próprio.
- Uso por outros SaaS da FM deve preservar IDs e permissões; emissão de licença de um produto não pode ativar outro.

**Gate 4:** testes de indisponibilidade, retries, eventos fora de ordem, perda de webhook, corrupção de identificador, fluxos de cancelamento/refund, multi-tenant e rollback.

## 5. Interface financeira premium em português

**Objetivo:** operação da FM e de cada cliente do Command com o mesmo software, sem dados compartilhados.

**Implementação:**
- Navegação **Configurações > Financeiro > Gateways**: catálogo de provedores instalados/homologados, conta, sandbox/produção, teste, status, prioridade e backup, credenciais em campos protegidos.
- Painéis por tenant/produto para assinaturas, trials, MRR/ARR (somente com semântica canônica implementada), cobranças, recebimentos confirmados, repasses, taxas, inadimplência e conciliação. Separar `billed`, `collected`, `settled` e `net`; ausência de fonte = **indisponível**, nunca 0 inventado.
- Layout responsivo azul premium consistente com a FM, 100% português, acessibilidade, loading/empty/error states, trilha de auditabilidade de cada valor e proteção RBAC de telas e servidor.
- Não alterar páginas financeiras atuais do Kordena sem plano de compatibilidade.

**Gate 5:** testes de usabilidade, navegador, mobile, acessibilidade, ações clicáveis, permissões e ausência de vazamento entre tenants.

## 6. Certificação e migração governada

**Objetivo:** demonstrar segurança financeira e prontidão comercial antes de qualquer produção.

**Matriz mínima:**
1. CI: lint, TypeScript, testes unitários/integrados/E2E, build, security/secrets scan; relatórios de cobertura relevante.
2. Banco descartável: migrations, RLS, FKs, transação concorrente, backups e restauração.
3. Gateway por provedor: sandbox + payload real de teste + reconciliação, sem pagamentos reais sem autorização.
4. Ataques: headers/tenant spoofing, webhook falso, replay, SSRF, segredo exposto, RBAC bypass, idempotência e race conditions.
5. Financeiro: valores, moeda, fees, refund, chargeback, split se aplicável, repasse, falha de rede, failover sem nova cobrança, débito/crédito consistente.
6. SaaS: modo sombra e comparação antes da virada, compra existente preservada; validação de Kordena e AtendeVendeIA separados.
7. Observabilidade: logs sem PII/secrets, métricas, alertas, rastreamento por correlation/event ID, reconciliação e quarentena operáveis.

**Go/no-go:** todo gate obrigatoriamente verde com evidência e aprovação humana para cada migração real. **Proibido** declarar produção pronta com mocks, fazer merge, deploy, ativação de credenciais ou transferir assinaturas sem aprovação expressa do Diretor.

## Como executar e prestar contas

- Trabalhar em **incrementos pequenos** na PR #62 (ou PRs dependentes, se houver risco de conflito), sempre com commits específicos, testes e documentação.
- A cada etapa, entregar: resumo do que já existia; arquivos alterados; riscos; resultados de lint/typecheck/tests/build; migrations e APIs efetivamente testadas; evidências verificáveis; lacunas e próximo gate.
- Marcar cada requisito como **IMPLEMENTADO / TESTADO / HOMOLOGADO / BLOQUEADO / NÃO INICIADO**; não confundir “contrato criado” com “gateway funcionando”.
- Não pedir para o Diretor decidir novamente UUIDv7, 15 min, 72 h, centralização multiempresa ou separação entre conta FM e cliente do Command. Perguntar somente por credenciais reais, bancos escolhidos, provedor a ativar, cutover, deploy ou decisões ainda não tomadas.
- Sem autorização adicional, executar **somente código em branch isolada, testes locais/CI e documentação**. Parar antes de ações financeiras irreversíveis.

**Definição de concluído:** o Command opera cobranças de assinaturas e licenças por empresa/produto/cliente com gateways configuráveis por interface, segregação comprovada, conciliação auditável e integração governada dos SaaS; somente declarar essa condição após passar os seis gates e a homologação externa aplicável.
