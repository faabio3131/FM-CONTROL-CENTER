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


## F3.7.5 — Auditoria de negativas e gate cruzado Node/Python (18/10/2026)

**CURRENT:** implementado na PR #90, ainda **NÃO CERTIFICADO** no Command por GitHub Actions com jobs concluídos sem steps.

- `route.ts` passou a registrar `fm_core.bridge.denied` para tentativas de organização/role não corporativos e payloads inválidos; falha dessa escrita é fail-closed para autorização e não expõe detalhes do banco.
- Testes unitários adicionados para auditoria de 403/400, cross-org e indisponibilidade do audit writer.
- `tests/f3-command-assistant-node-envelope.mts` importa a implementação real `sendGovernedCommandBridgeAction` e captura o corpo/headers HMAC produzidos pelo runtime Node, sem substituir o assinador.
- `tests/f3_command_assistant_cross_runtime.py` envia o envelope bruto ao **FastAPI/ASGI real** do Assistant de checkout público **pinado** em `45b35a6900c59825a987d9db47e98ad18073dec2`, com fixture sintético e SQLAlchemy. Cenários: organização forjada negada, provision, nonce replay, grant, Core autorizado, revogação de grant, Core negado, revogação irreversível da identidade e auditoria.
- O Foundation Gate faz checkout do Assistant **público**, configura Python 3.12, instala somente dependências de teste e executa o cross-runtime suite após Vitest, antes do secret scan.
- Esta é **prova de envelope e processamento ASGI entre runtimes reais**, mas usa interceptação do transporte Node na fixture e TestClient no destino. Não demonstra TLS de rede, DNS, ACL, latência/timeout reais, Vault externo nem deploy.
- A revisão de código identificou risco de observabilidade: uma alteração confirmada no Assistant pode preceder a escrita de auditoria no Command; se esta falhar, a resposta Command fica ambígua. O Assistant já possui auditoria transacional canônica. Uma rotina de reconciliação por `command_request_id`, sem repetir comandos, deve ser definida e testada antes da homologação. **Não classificar como resolvido.**
- A revisão técnica deste checkpoint não substitui a revisão **independente** exigida pelo AGENTS.

**CI:** no HEAD `045168112162902111972c7bda819e436a5e7e69`, Foundation `39141682746`, F21 `39141682831` e Cognitive `39141682750` encerraram FAILURE antes de executar testes; conferir steps a cada nova tentativa. Resultado do novo teste cruzado: **NOT_TESTED / BLOCKED_EXTERNAL**, jamais GREEN.

**Próxima sequência permitida:** recuperar runner/Actions, executar lint/typecheck/unit/build + teste Node/Python, corrigir qualquer RED, obter segunda revisão, completar controles Vault/rede/reconciliação e gate F3. Nenhum merge/deploy/credencial real foi autorizado por este checkpoint.


## F3.7.6 — Audit-intent obrigatório antes do envio (18/10/2026)

**Problema identificado:** a mutação no Assistant pode ter sido confirmada enquanto o registro final no Command falha; o `command_request_id` anteriormente nascia apenas dentro do cliente HTTP e não tinha evidência local prévia.

**Hardening implementado, ainda não certificado por CI Command:**
- A rota só transmite a mutação depois de **persistir uma tentativa autorizada** (`result=allowed`, `action=...requested`) no ledger de auditoria corporativo, com UUID gerado exclusivamente server-side, actor e escopo.
- O **mesmo UUID** segue no corpo HMAC até o Assistant como `command_request_id`, e aparece na auditoria de confirmação/falha do Command. Sem auditoria prévia, sem envio.
- O cliente Node valida o UUID/identificador e não admite substituição por payload HTTP público.
- Testes: sem envio quando audit-intent falha; mesmo ID no envio e registros; falha de auditoria posterior fica rastreável pelo intent; não vaza detalhes sensíveis nem faz retry cego.
- Esta estratégia é um **pré-registro verificável**, não uma transação distribuída nem reconciliação já implementada. Falta mecanismo de consulta/reconciliação somente leitura e prova de outcomes entre Command e Assistant, além de política de retenção, alerta e revisão independente.

**GATE:** novo código e testes versionados; Command GitHub Actions segue `NOT_TESTED / BLOCKED_EXTERNAL`, sem promoção para merge, deploy, segredo real ou homologação.
