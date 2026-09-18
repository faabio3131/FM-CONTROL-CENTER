# FM Control Center

SaaS comercial independente da Nova FM Tecnologia. A Nova FM é o Tenant Zero.

## Estado
- F00–F04: discovery/System Design concluídos.
- F05: ADRs e governança aprovados.
- F06: fundação técnica em execução.
- F09/Core funcional: não iniciado.

## Stack F05
Node.js 24 LTS · Next.js 16.3.x · TypeScript · PostgreSQL 18 · Drizzle · Better Auth Organizations · GitHub Actions · Render target inicial.

## Desenvolvimento
```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

Nunca versione secrets. A `main` permanece fora desta execução até auditoria/autorização.
