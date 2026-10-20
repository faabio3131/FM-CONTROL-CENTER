# F3 — Homologação controlada Command → Assistant → Core

**Estado:** PREPARAÇÃO / NÃO EXECUTADO. A infraestrutura real e as credenciais
dependem de autorização humana específica. Este runbook não autoriza deploy.

## Pré-condições obrigatórias

- CI 100% verde no HEAD das três PRs; revisão de segurança independente
  concluída e arquivada. PRs permanecem Draft enquanto F3 global IN_PROGRESS.
- Auditoria de segredos do histórico completo do repositório, que foi tornado
  público, além da varredura do código atual. Qualquer achado exige revogação e
  avaliação de exposição antes de ativar credenciais.
- Ambientes de **staging isolados** para Command, Assistant e Core, sem tocar
  produção ou reutilizar senha/chave administrativa de outros sistemas.
- PostgreSQL exclusivo do staging, backup e restauração em banco descartável.
  Migration Assistant `20261018_0008` e predecessoras somente mediante
  aprovação para banco de staging; nunca rodar upgrade sem confirmar DATABASE_URL.
- HTTPS válido, entrada de serviço restrita por ACL/ingress e egress governado;
  DNS e conectividade verificados do lado do servidor, sem usar frontend.
- Secret manager/Vault com namespaces distintos, least privilege, versionamento,
  rotação, revogação, acesso auditado e ausência de valores secretos nos logs.
- Quota/circuit breaker, limites por organização e serviço, rate limit de
  consultas status, alertas de erro, custo e anomalias; não habilitar operação
  real se não estiverem certificados.
- Conta humana FM corporate com role owner/admin + step-up; tenant/organização
  de staging diferenciados de qualquer cliente produtivo.

## Configuração a verificar (nomes, nunca valores)

Command:
`FM_COMMAND_PLATFORM_ORGANIZATION_ID`,
`FM_COMMAND_CORE_BRIDGE_ASSISTANT_URL`,
`FM_COMMAND_CORE_BRIDGE_CONTROL_KEY_ID`,
`FM_COMMAND_CORE_BRIDGE_CONTROL_SIGNING_KEY`,
`FM_COMMAND_CORE_BRIDGE_TARGET_KEY_ID`.

Assistant:
`FM_ASSISTANT_TRUSTED_COMMAND_ORGANIZATION_ID`,
`FM_ASSISTANT_COMMAND_CONTROL_KEY_ID`,
`FM_ASSISTANT_COMMAND_CONTROL_SIGNING_KEY`,
`FM_ASSISTANT_CORE_BRIDGE_KEY_ID`,
`FM_ASSISTANT_CORE_BRIDGE_SIGNING_KEY`.

**Invariantes:** chave Command ≠ chave Core ≠ chaves Vault/admin/session;
chaves nunca são apresentadas ao usuário, ChatGPT ou repositório; criar apenas
direto no secret manager autorizado, com ID e escopo novos para staging.

## Ordem de homologação

1. **Go/no-go antes do deploy:** registrar autorizações específicas, operador,
   ambiente, hashes de artefato e rollback; sem autorização = BLOCKED_EXTERNAL.
2. Com os serviços em staging, verificar healthchecks, TLS/certificados,
   restrições de acesso e assinaturas HMAC válidas; negar assinatura ausente,
   modificada, expirada, nonce repetido e key ID errado.
3. Conta FM autenticada com step-up faz `provision` para identidade de serviço
   configurada, sem retorno do segredo ao navegador.
4. `grant` para tenant/unidade/capability fictícios; Core obtém apenas a
   credencial daquele escopo, com trilha de auditoria e consumo medido.
5. Provar isolamento: outro tenant, unidade, capability, ator, organização,
   key ID e role sem autorização devem falhar sem disclosure.
6. `revoke_grant`: próximo acesso do Core é negado imediatamente;
   consultar `status` por `command_request_id` e exigir resultado canônico.
7. Repetir `status` com mesmo nonce deve gerar negativa; status com nonce novo
   deve retornar resultado correto, sem alterar identidades nem grants.
8. `revoke_identity`: todos os grants e novos acessos ficam negados;
   reativação do mesmo ID é proibida.
9. Testar falha simulada de auditoria, timeout e resultado remoto ambíguo;
   **não reenviar mutação**: conciliar via lookup governado e ledger do Assistant.
10. Avaliar logs sem PII/segredos, tracing, quotas, breakers, FinOps,
    backup/restore, rotação de chave e recuperação de incidente.

## Critérios de aprovação e evidência

- Guardar hash de commit, workflows, testes, IDs/correlações e contagens,
  evidência transacional redigida e confirmação das políticas de rede/Vault.
- Resultado `unknown` não é sucesso e não dá permissão para retry cego.
- Secret scanning do HEAD não prova que o histórico público não continha chave.
- Atestar explicitamente: `STAGING_APPROVED`, `BLOCKED_EXTERNAL` ou `RED`.
  Nenhum resultado sintético é promovido para `PRODUCTION_APPROVED`.
- Sem merge das PRs F3 enquanto governança, review independente e gates
  aplicáveis não estiverem GREEN integralmente.
- Produção, migrações em banco real, segredo real, gasto e deploy sempre
  requerem consentimento específico, mesmo que todos os testes sejam verdes.

## Resultado desta etapa

Preparação documental somente. Nenhum recurso, credencial, serviço, migration
em banco persistente, deploy ou tráfego externo real foi ativado.
