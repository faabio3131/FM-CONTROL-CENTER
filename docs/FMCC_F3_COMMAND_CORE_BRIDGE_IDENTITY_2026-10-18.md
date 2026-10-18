# F3 — FM Command corporativo: gestão governada de identidades Core

**Data:** 2026-10-18  
**Entrega:** PR #90 Draft, sem merge/deploy.
**Origem da demanda:** F3.7.3 do SaaS Atendente + Vendedor IA.

## Segurança e segregação

Esta capacidade opera no **Command corporativo da FM** (`FM-CONTROL-CENTER`),
não no produto independente `fm-command-v2`.

A API `POST /api/integrations/fm-core/bridge/identities` exige autenticação
Better Auth, organização atual igual a `FM_COMMAND_PLATFORM_ORGANIZATION_ID`,
papel owner/admin nessa organização e reautenticação por senha da mesma conta.

Um administrador de tenant cliente não tem autoridade de administrador da FM.

O Command só aceita as ações `provision`, `grant`, `revoke_grant` e
`revoke_identity`. Em todas, a identidade alvo do Core é fixada por variável
da plataforma, nunca pelo cliente/request. Actor e organização são extraídos
da sessão confiável; não são lidos do body da requisição.

## Comunicação com Assistant

HMAC SHA256 assinado por requisição com corpo JSON exato, timestamp UNIX,
nonce aleatório e caminho fixado. Origem HTTPS sem userinfo/query/path.
Timeout de 5 segundos, sem redirect automático nem retries ambíguos.
Resposta nunca retorna chave Core, Vault ou HMAC do Command.

Configuração em secret manager:

- `FM_COMMAND_PLATFORM_ORGANIZATION_ID`: organização corporativa FM;
- `FM_COMMAND_CORE_BRIDGE_ASSISTANT_URL`: HTTPS origin do Assistant;
- `FM_COMMAND_CORE_BRIDGE_CONTROL_KEY_ID`: ID da autoridade S2S;
- `FM_COMMAND_CORE_BRIDGE_CONTROL_SIGNING_KEY`: HMAC exclusivo do Command;
- `FM_COMMAND_CORE_BRIDGE_TARGET_KEY_ID`: ID permitido da identidade Core.

No Assistant:

- `FM_ASSISTANT_TRUSTED_COMMAND_ORGANIZATION_ID` = organização corporativa;
- `FM_ASSISTANT_COMMAND_CONTROL_KEY_ID` = ID de autoridade Command;
- `FM_ASSISTANT_COMMAND_CONTROL_SIGNING_KEY` = segredo correspondente;
- `FM_ASSISTANT_CORE_BRIDGE_KEY_ID` = identidade Core, com segredo diferente.

Nenhuma chave é criada ou colocada no repositório. Sem configuração válida,
a operação falha fechada. Os parâmetros ainda **não foram aplicados em produção**.

## Lifecycle e auditoria

O Assistant é a fonte canônica de identidades e grants Core, com auditoria
append-only de nonce, ação, actor, escopo, outcome e hora. Provisionamento
só cadastra ID de uma credencial Core já governada no secret manager; não
gera material criptográfico nem distribui segredo.

Revogação do grant impede novas liberações para tenant/unidade/capability.
Revogação da identidade também bloqueia todos os grants associados e
é irreversível para aquele ID. Rotação exige novo ID/segredo previamente
provisionado sob política de aprovação.

O Command registra auditoria corporativa de alterações confirmadas.
Falhas ou resposta ambígua são registradas sem segredos, retornando erro
genérico; não há retry cego.

## Testes e gates

- Teste HMAC Node ↔ Python com vetor independente e estático.
- Testes de envelope, spoof de actor/alvo, isolamento da organização FM,
  senha de step-up, papel administrativo, falha de rede e parâmetros ausentes.
- Testes de assinatura/nonce/replay/revocation/migration no Assistant.
- **GitHub Actions do Command não executou etapas na PR #90**:
  os jobs terminaram sem `steps`. Não atribuir GREEN ao Command.
- A branch deste PR não altera billing nem dados reais.
- Antes de merge: CI lint/typecheck/test/build, segunda revisão independente
  de segurança, E2E de transporte Command→Assistant e verificação da cadeia
  de release, PostgreSQL concorrente, documentação e aprovação governada.

**GATE ATUAL:** F3 IN_PROGRESS; Command CI BLOCKED_EXTERNAL;
sem deploy, migration real ou segredo de produção; PR Draft.
