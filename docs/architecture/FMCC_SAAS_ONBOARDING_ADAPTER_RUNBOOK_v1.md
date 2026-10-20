# FMCC / Command — Preparação de novos SaaS (C08)
**Data:** 20/10/2026  
**Status:** padrão interno de construção; NÃO é homologação S2S nem autorização de release.

## Autoridade
O FMCC controla o registro comercial e as fontes governadas. Command é o painel da FM, que opera como Tenant Zero sem privilégios arquiteturais exclusivos. O SaaS mantém identidade local, Core cognitivo vertical, enforcement de entitlement/quota, métricas e autoridades do domínio. Gateways externos continuam autoridades sobre liquidação, nunca o dashboard.

## Sequência para cada novo SaaS
1. Cadastrar produto ativo no tenant autorizado; não derivar tenancy de headers livres.
2. Documentar contrato versionado (capabilities, métodos, schema, health, origem, autorização, mapeamento, limites e proveniência) e ADR para alterações estruturais. Não copiar endpoints de IRON/Kordena sem contrato real.
3. Implementar um `Connector` tipado no FMCC e autenticação via secretRef server-side, HTTPS allowlist, timeout, retries restritos, idempotência, isolamento e falha segura.
4. Registrar o Connector em `src/application/integration/connector-composition.ts` — perfil sozinho NÃO o registra no runtime.
5. Adicionar perfil em `src/application/integration/saas-adapter-profiles.ts`, especificando `productSlug`, `sourceType`, `mappingVersion`, `syncMode`, `secretRef` e domínio. Interface e validação do backend leem este catálogo; não adicionar regras por produto na tela.
6. Usar o Source Registry existente para registrar a fonte governada; valor real do segredo permanece no gerenciador de segredos. Conferir vínculo tenant/produto e permitidos RBAC.
7. Validar localmente health, schema, sync e proveniência com fixtures e cenários adversariais; API C08 expõe apenas catálogo público e status local. Uma fonte saudável NÃO prova E2E com SaaS autenticado.
8. Validar em etapa separada os dois sistemas em ambiente isolado: identidade S2S, versões, assinatura/escopos, replay, tenant/unidade cruzados, timeout pós-commit, concorrência, outbox/inbox, entrega/ack e reconciliação. Não inferir homologação externa.
9. Após software internamente concluído, obter autorizações específicas para segredos reais, migrations operacionais, workers, deploy, testes com gateway live e GO de produção.

## Critérios de bloqueio
- Produto sem perfil: **adaptador pendente**.
- Perfil sem Connector real: **não conectado**; cobertura de consistência obrigatória antes de ativação.
- Fonte criada e sem health: **não verificada**.
- Sync recente: **observação local**, jamais E2E certificado.
- Erro de autenticação, drift de contrato, falha cross-tenant ou segredo exposto: **STOP da operação afetada**.
- Não usar repositório ou versão de outro SaaS como autoridade financeira do produto.

## Aceite deste incremento
`tests/source-registry.unit.test.ts` testa paridade dos perfis com os Connector atuais, vínculo e fixture de futuro SaaS; `tests/c08-readiness-service.unit.test.ts` garante resposta da API sem secretRef nem URL. Foundation, F21 e Cognitive validados no HEAD exato. Sem novas migrations, conectores novos, credenciais, jobs ou deploy. Rollback de código pelo histórico Git.

## Evolução ainda pendente
Handshake S2S versionado, envelope de comando e receipts, disponibilidade de provedores/ambientes, matriz cross-repo Kordena/IRON/Assistant/VendeAtendeIA e onboarding completo de SaaS sintético com executor de ponta a ponta devem receber WPs próprios do cronograma C04–C08. Este documento não promove o draft do protocolo a contrato final aprovado.
