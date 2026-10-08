# Billing Central — cofre de credenciais, operações administrativas e gates

**Status:** armazenamento criptografado e rotas administrativas implementados em PR #62 Draft; **não habilitados em produção, não homologados para cobranças reais**.

## O que foi implementado

- Tabela `fmcc_billing_gateway_secret` (migração `0005_billing_gateway_vault.sql`) com vínculo composto `(tenant_id, account_id)`, RLS `ENABLE/FORCE` e política que exige escopo do tenant.
- Criptografia autenticada **AES-256-GCM** por segredo com nonce aleatório, tag e AAD vinculada aos identificadores de tenant e conta; ciphertext armazenado no PostgreSQL. A chave mestra não é armazenada no banco, no código ou na API.
- `FMCC_BILLING_VAULT_KEY_B64`: chave de 256 bits em Base64, fornecida por mecanismo de gestão de segredos do ambiente. Nenhum valor de exemplo é válido para produção; não provisionar chave real no repositório.
- `FMCC_BILLING_GATEWAY_MANAGEMENT_ENABLED=true`: habilitação administrativa **explicitamente opt-in**, falsa quando ausente. Habilitar só em ambiente de teste isolado até passar os gates de segurança.
- `POST /api/billing/gateway-accounts/manage`: cadastra conta e segredo na mesma transação, conta permanece `disabled`.
- `PATCH /api/billing/gateway-accounts/manage`: `action=update` (rótulo e/ou ambiente), `action=rotate` (substituição criptografada da credencial), `action=disable`. Todas deixam conta `disabled` e inserem auditoria na mesma transação.
- O usuário autenticado precisa de `billing:write`; tenant é resolvido na sessão do Command, jamais selecionado no payload. Restrições RLS são definidas com `set_config(..., true)` somente na transação.
- APIs não retornam segredos nem `credentialRef`. Contas de gateway permanecem desativadas para recebimento real: **não existe ativação de gateway de pagamento neste estágio**.
- Teste de PostgreSQL descartável atualizado para aplicar migração 0005 e verificar RLS de segredos; testes unitários de autenticação AES-GCM, adulteração e cruzamento de tenant.

## Distinção importante: cofre interno versus serviço gerenciado

Esta implementação cria **um cofre cifrado na aplicação**, dependente de uma chave mestra injetada com segurança pela infraestrutura. **Ela não é uma integração final com AWS Secrets Manager, GCP Secret Manager, Azure Key Vault ou HSM/KMS**. A escolha de provedor, política de IAM, rotação e versionamento da chave mestra e proteção operacional ainda exigem implementação/homologação. Não declarar esse requisito encerrado até validar um gerenciador externo efetivo e a recuperação segura de ciphertext legado durante rotação de chaves.

## Gates ainda necessários

1. Provisionar gerenciador externo de segredos com acesso mínimo por ambiente, IAM, trilha de acesso e política de backup/rotação. Não adicionar segredos a variáveis públicas ou logs.
2. Aplicar migrations em banco de teste isolado, validar conta de runtime **não-superusuário e sem BYPASSRLS**. Evitar o mesmo role de migração como runtime.
3. Testes E2E das quatro operações (create/update/rotate/disable), rollback transacional, concorrência, 401/403, CSRF, rate limits, múltiplos tenants e auditoria; revisar a validação Origin atrás de proxy confiável.
4. Cadastro de gateway **não** é homologação do provedor: validar adaptadores reais, verificações de credenciais e conta recebedora, sandbox, políticas de webhook e reconciliação antes de qualquer ativação financeira.
5. Revisão de vulnerabilidades, observabilidade e procedimento de resposta a incidente e revogação de segredo.

**Governança:** PR permanece Draft, sem merge/deploy em produção, sem credenciais reais, sem pagamento real e sem transferência de autoridade comercial.
