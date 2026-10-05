# FM Command — Configuração do tenant Nova FM Tecnologia

Data: 2026-10-05

## Regra arquitetural

O FM Command permanece um único SaaS comercial genérico. A Nova FM Tecnologia é uma organização/tenant configurada dentro do produto, não uma variante de código.

- Código-base único.
- Nenhum fork FM vs. comercial.
- Marca do fornecedor: FM Tecnologia / FM Command.
- Nome da empresa usuária vem do tenant autenticado.
- Integrações opcionais só aparecem quando configuradas no tenant.
- Segredos permanecem por referência; nenhum token é persistido em config ou código.

## Baseline comercial protegido

Baseline anterior certificado e mergeado:
`8f1c9f79f3a056393509d414b5670c2415413eb2`

Tag local de referência:
`fm-command-internal-layer-certified-2026-10-05`

## Estado real do tenant Nova FM Tecnologia antes desta tranche

Organização:
- Nova FM Tecnologia: existente e ativa.
- Proprietário: existente com papel `owner`.

Produtos:
- Kordena: ativo.
- IRON: ainda não cadastrado.
- CampaIA: ainda não cadastrado.

Kordena:
- Source: `Kordena Commercial`.
- Tipo: `kordena-commercial-v1`.
- Status: `healthy`.
- Segredo: referência `env:FMCC_KORDENA_CONTROL_PLANE_TOKEN`.
- Syncs recentes: `completed`.
- Canonical facts persistidos no FM Command: 0.
- Metric values persistidos no FM Command: 0.

Auditoria read-only do runtime Kordena confirmou:
- endpoint `/v1/control-plane/fmcc/snapshot` operacional com HTTP 200;
- projection KCA-12 presente no deploy;
- geração de facts exclui deliberadamente clientes `internal_test`;
- zero facts é compatível com ausência de contas comerciais externas ou ambiente contendo somente dados internos/teste;
- nenhum filtro deverá ser removido apenas para fabricar dados no Command.

## Proteção de genericidade implementada nesta tranche

- Dashboard usa o nome real da organização autenticada.
- `Nova FM Tecnologia` removida do branding global do produto-base.
- FM Tecnologia permanece somente como marca do fornecedor.
- Kordena no menu, Configurações e atalhos da Home passa a ser feature tenant-scoped.
- Busca Global recebe a mesma feature map e não inventa navegação Kordena para tenant sem a integração.
- Produto/source podem continuar pesquisáveis quando existirem, mesmo que um módulo opcional esteja desabilitado.
- Nenhuma credencial ou configuração específica da Nova FM foi hardcoded.

## Certificação local

- Typecheck: PASS.
- Lint: PASS.
- Testes focados pós-correção: 16/16 PASS.
- Suíte integral: 82/82 arquivos, 342/342 testes PASS.
- Production build: PASS.
- 46 páginas/rotas geradas.
- `git diff --check`: PASS.

## Próximas ações de configuração do tenant

1. Promover esta proteção de genericidade via PR/CI/merge.
2. Cadastrar IRON no tenant Nova FM Tecnologia usando `POST /api/products` autenticado.
3. Cadastrar CampaIA no mesmo tenant pela mesma autoridade.
4. Registrar as sources reais de cada produto somente quando contrato, endpoint e credenciais estiverem definidos.
5. Homologar health/sync/provenance de cada source.
6. Manter dados ausentes como indisponíveis; nunca criar fatos ou métricas de demonstração como se fossem reais.
