# Deploy do Command no servidor Contabo

Caminho de entrega controlado: **nenhum agente recebe acesso ao servidor**. O deploy é um
workflow manual do GitHub que entra por uma chave exclusiva, e essa chave só consegue rodar
`deploy command <sha>`.

## Como funciona

1. O PR é revisado e entra na `main` (merge só por ordem do dono).
2. O dono abre **Actions → Deploy Command to Contabo → Run workflow** e informa o SHA completo (40 caracteres).
3. O ambiente `production-contabo` pede a aprovação do dono antes de o job rodar (enquanto o repositório for público).
4. O job entra por SSH como o usuário `deploy`. O `sshd` executa **apenas** `/opt/fm/bin/deploy-gate` (opção `restrict,command=`), que valida o pedido e chama `deploy-app` como `fmadmin` (regra de `sudo` exata).
5. `deploy-app`:
   - recusa SHA que não esteja na `main`;
   - recusa se houver **migrações novas** (`drizzle/`) entre a versão atual e a pedida; migração é uma etapa manual separada;
   - faz o **backup do banco** antes;
   - constrói a imagem, sobe e espera o healthcheck;
   - se falhar, **volta sozinho** para a versão anterior (`fmcc:prev`) e registra em `/opt/fm/deploy.log`.
6. O workflow confere `GET /api/version` e exige que o commit retornado seja o pedido.

## Instalação (uma vez, no servidor, com `sudo`)

1. No PC do dono, gerar a chave exclusiva (sem passphrase, pois fica como segredo do GitHub) e **apagar o arquivo depois de copiar para o GitHub**.
2. Antes de instalar, conferir que `/opt/fm/command/src`, o Compose, a imagem atual, o contêiner saudável e `/opt/fm/backups/backup-command.sh` existem. O `install.sh` recusa o ambiente se qualquer pré-requisito falhar, **antes** de alterar o Compose. Copiar este diretório para o servidor e rodar: `sudo ./install.sh "ssh-ed25519 AAAA... gh-deploy-command"` (chave **pública**).
3. No GitHub: criar o ambiente `production-contabo` com revisor obrigatório (o dono); variáveis `CONTABO_HOST`, `CONTABO_SSH_KNOWN_HOSTS` e `FMCC_PRODUCTION_BASE_URL`; segredo `CONTABO_DEPLOY_SSH_KEY` (chave **privada**). Obter a chave pública do servidor por `ssh-keyscan -t ed25519 <host>`, mas **comparar sua impressão digital com a chave verificada no console/provedor Contabo** antes de confiá-la. O `ssh-keyscan` sozinho não autentica o servidor.

## Limites assumidos

- Só o app `command`. Outros apps ganham o próprio script, a própria chave e o próprio ambiente.
- Revisor obrigatório em ambiente só existe para repositórios públicos ou em planos pagos; em repositório privado no plano gratuito, a trava passa a ser o disparo manual.
- Nenhum segredo fica neste repositório. O `.env` do servidor nunca é lido pelo workflow.
