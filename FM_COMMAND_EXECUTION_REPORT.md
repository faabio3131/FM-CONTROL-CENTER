# FM Command — Execution Report

Data: 2026-10-01
Branch: fix/fm-command-completion-20261001
Base congelada: main@f7535423d38751bbc38f6d7e5e6013a485bfcf0e

## Correções internas executadas

### Kordena commercial read × Source Registry
Finding HIGH confirmado e corrigido.
- Antes: /dashboard/commercial/kordena chamava SourceRegistryService.list(), exigindo source:read.
- Depois: CommercialSourceResolver exige commercial:read e faz lookup interno tenant-scoped.
- Viewer/Member não receberam source:read.
- Administração geral do Source Registry continua protegida.
- Mutação comercial permanece owner/admin + commercial:write + step-up/approval.

### Navegação por permissão
- Criado src/presentation/command-navigation.ts como fonte canônica de navegação e capability.
- CommandShell recebe role resolvida server-side e filtra itens usando roleHasPermission.
- Fontes e Integrações fica invisível para Viewer/Member; Kordena permanece visível.

### Onboarding
- UI client preservada em onboarding-client.tsx.
- /onboarding passou a ter barreira server-side via auth.api.getSession.
- Anônimo é redirecionado para /sign-in.

### Visual Premium
- PR #32 foi reconciliada na branch de conclusão.
- O visual premium foi integrado sem descartar as correções RBAC/onboarding.
- E2E visual conserva os viewports 1920x1080, 1366x768, 768x1024 e 390x844.
- Busca/notificações sem backend permanecem explicitamente indisponíveis/não interativas.

### Branch protection
main foi endurecida:
- required checks: foundation + readiness;
- strict/update branch: ativo;
- force-push: proibido;
- delete: proibido;
- admins: sujeitos à proteção;
- resolução de conversas: obrigatória.
Preview não foi tornado required pre-merge porque o workflow atual só executa em push de main/manual; exigir esse check em PR criaria dependência circular.

## Evidência de testes locais focalizados
- 5 test files passed.
- 19 tests passed.
- typecheck sem erro.
- lint focalizado/branch antes da reconciliação visual: verde.
A matriz integral final é delegada também aos GitHub Actions Foundation/F21 na PR da branch final.

## Runtime
Preview CURRENT antes das alterações: main@f7535423..., health e ready 200.
O candidate final exige novo Preview no SHA exato; sem isso não há aprovação final.

## Segurança
Nenhum secret real foi adicionado.
Nenhum bypass de auth/authorization foi criado.
Nenhuma produção foi promovida.
Nenhum merge em main foi executado.
