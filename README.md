# FM Control Center

SaaS comercial independente da Nova FM Tecnologia. A Nova FM é o Tenant Zero.

## Estado
- F00–F04: discovery/System Design concluídos.
- F05: ADRs e governança aprovados.
- F06: Fundação Técnica Web/Cloud **concluída e certificada em Preview** em 19/09/2026.
- F07: Integration Fabric **liberada para início**; ainda não iniciada nesta certificação.
- F08: Metric Engine não iniciado.
- F09: Cognitive Core funcional não iniciado.

## Evidência F06
- Render Preview real com Web Service + PostgreSQL;
- migrations aplicadas;
- `/api/health` e `/api/ready` verdes;
- auth, logout/re-login e tenancy validados;
- isolamento multi-tenant automatizado e manual;
- DevTools final sem erros/issues.

Documentação:
- `FMCC-06-FUNDACAO-TECNICA-WEB-CLOUD-v0.1.md`
- `FMCC-06-CLOSURE-CERTIFICATION-2026-09-19.md`

## Stack F05/F06
Node.js 24 LTS · Next.js 16.3.x · TypeScript · PostgreSQL 18 · Drizzle · Better Auth Organizations · GitHub Actions · Render Preview.

## Desenvolvimento
```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

Nunca versione secrets. Produção permanece fora da certificação F06.
