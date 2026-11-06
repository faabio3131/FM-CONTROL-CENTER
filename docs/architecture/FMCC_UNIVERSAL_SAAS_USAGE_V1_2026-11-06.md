# FM Command — Contrato universal de consumo SaaS v1

Status: implementado como *consumer/adapter candidato no Command*, sem conexão produtiva automática e sem alteração dos SaaS verticais. Ramo `feat/command-universal-saas-onboarding-v1` (2026-11-06).

## Objetivo

Permitir que **qualquer produto ativo**, inclusive NFCore, IRON, VendeAtendeIA e SaaS futuros, integre telemetria operacional ao FM Command **sem novo conector bespoke**, quando seu backend implementar um único endpoint. Conectores nativos já existentes continuam válidos e não são substituídos. Não usar este endpoint para faturamento, entitlement, suspensão, checkout, pagamento ou aprovação fiscal.

### Contrato HTTP
`GET {SAAS_BASE_URL}/v1/fmcc/saas/usage`

Requisição exclusivamente servidor → servidor, TLS obrigatório, sem redirects; `Authorization: Bearer <token-dedicado>`, `X-Correlation-Id: <correlationId>`, `Accept: application/json`.

O servidor SaaS deve:
- Validar **token individual**, rotação, escopo Command tenant/produto, versão de contrato, escopo autorizado e rate limits. Nunca aceitar `X-Tenant-ID` do navegador como autorização.
- Vincular `commandTenantId`, `productId` (ID no Command), `productSlug`, `correlationId` à identidade autenticada e retorná-los exatamente. A identidade do SaaS não deriva de campos JSON isolados.
- Calcular fatos usando contadores duráveis e fonte canônica, jamais inventar valores indisponíveis; emitir `snapshots: []` quando não houver observações, sem afirmar consumo zero.
- Não incluir PII, dados do cliente, prompts, faturas, preços, chaves, certificados ou dados bancários. `externalTenantRef` é um identificador opaco estável, **não email/CNPJ/CPF**.
- Responder com JSON limitado a 128 KiB, até 128 snapshots por leitura e 24 métricas por snapshot. Lotes superiores exigem versão futura paginada, sem truncamento enganoso.
- Distinguir `limitStatus` entre `bounded` (limite numérico explícito), `unlimited` (alegação do próprio SaaS sem equivaler a autorização comercial) e `unknown` (limite desconhecido). Para os dois últimos, `limit: null`.

### Exemplo de resposta

```json
{
  "schemaVersion": "fmcc.saas.usage/v1",
  "productSlug": "nfcore",
  "productId": "uuid-canonico-do-produto-no-command",
  "commandTenantId": "tenant-fm-tecnologia",
  "correlationId": "corr-123",
  "authority": "saas-runtime",
  "observedAt": "2026-11-06T16:00:00Z",
  "snapshots": [{
    "externalTenantRef": "issuer-opaque-001",
    "periodStart": "2026-11-01T00:00:00Z",
    "periodEnd": "2026-11-30T23:59:59Z",
    "metrics": [
      {
        "metricId": "fiscal.documents_authorized",
        "unit": "count",
        "quantity": 420,
        "limitStatus": "bounded",
        "limit": 1000
      },
      {
        "metricId": "ai.tokens_input",
        "unit": "tokens",
        "quantity": 80000,
        "limitStatus": "unknown",
        "limit": null
      }
    ]
  }]
}
```

`quantity` e `limit` devem ser inteiros seguros não negativos; o Command rejeita valores inválidos, duplicações de (tenant, período) ou métricas, períodos incoerentes, identidades/correlação divergentes e limites sem estado explícito.

### Configuração por produto no Command

Para `productSlug=nfcore`, cadastrar **referências**, não valores secretos, pelo painel `/dashboard/sources`, opção **Consumo operacional universal v1**:

- `sourceType=fmcc-saas-usage-v1`
- `mappingVersion=fmcc-saas-usage-v1`
- `authoritativeDomain=operational`
- `syncMode=pull`
- `source.config.baseUrl=https://api.nfcore.com.br` (somente raiz HTTPS)
- `source.config.productSlug=nfcore`
- `source.secretRef=env:FMCC_SAAS_NFCORE_CONTROL_TOKEN`

No runtime **do Command**, os responsáveis devem provisionar, pelo ambiente seguro (não no Git):

- `FMCC_SAAS_NFCORE_CONTROL_TOKEN` — token dedicado >=32 caracteres, concordado com o backend NFCore;
- `FMCC_SAAS_NFCORE_ALLOWED_ORIGINS=https://api.nfcore.com.br` — somente origins exatas de HTTPS, sem barra final;
- `FMCC_SAAS_NFCORE_COMMAND_TENANT_ID=<tenant-ID-FMCC>` — tenant corporativo expressamente autorizado.

Para qualquer outro slug, converter letras em MAIÚSCULAS e hífens em underscores (por exemplo `gym-pro` → `FMCC_SAAS_GYM_PRO_...`). Os três valores são **fail-closed**: ausentes, divergentes ou inválidos impedem a conexão. Nada é provisionado automaticamente. Não há credencial partilhada entre produtos.

### Visibilidade e governança

Depois de cadastrar a fonte e passar um healthcheck autenticado, o operador pode iniciar `sync` com idempotency key. O conector passa pelos repositórios atuais do Command e grava `saas.usage.snapshot.v1` em `fmcc_canonical_fact` com tenant, produto, fonte, timestamp e provenance. O cursor SHA-256 evita reingestão de lotes idênticos.

O painel `/dashboard/products/{productId}/operational-usage` é somente leitura para owner/admin autenticado com `metric:read`, `source:read` e `product:read`. Consulta o tenant e produto da sessão e **apenas fontes universais registradas corretamente**. Mostra as últimas 80 observações, status da quota por métrica (verde <70%; âmbar >=70%; vermelho >=100%) e identificador externo opaco. Não soma snapshots históricos, não converte dados faltantes em zero e não fatura.

Para emissão fiscal, assinatura, cobrança, MRR, pagamento, trial, inadimplência ou kill switch, continuar usando as autoridades canônicas distintas do Command e do SaaS. Uma fonte de consumo registrada **não é homologação externa nem autoridade comercial**.

### Gate de integração de cada SaaS

1. O backend SaaS implementa este endpoint com token escopado, retorno versionado e dados duráveis.
2. O Command registra o produto ativo e fonte universal, resolve os três parâmetros exclusivamente do servidor.
3. Testar 401/403, tenant trocado, produto errado, origem HTTPS incorreta, payload replay/duplicado, outage, timeout e falha de medição.
4. Executar primeira sincronização, confirmar fatos por tenant e fonte, qualidade/provenance e observações no cockpit.
5. Só depois registrar homologação E2E e configurar o canal comercial/financeiro apropriado. Não usar a telemetria para presumir billing.

**A capacidade receptora do Command não prova que os SaaS externos já implementaram o contrato.**
