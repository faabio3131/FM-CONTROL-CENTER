# FM Command — Planos comerciais, limites e custo de IA por produto

**Data:** 2026-10-18
**Status:** contrato de arquitetura para construção interna, não configuração externa/homologação.

## Responsabilidades canônicas

- **FM Command:** painel corporativo e governança do catálogo mestre por
  `product_id` + `plan_code` + `plan_revision`, com administração FM,
  preço comercial, tributos, custo previsto, margem, campanhas, trials,
  upgrades e indicadores consolidados entre produtos.
- **FM Assistant / produto SaaS:** licença ativa de cada tenant, período,
  trial, direitos/entitlements vigentes e autorização por tenant/unidade.
  Um tenant nunca altera unilateralmente a própria política de limite.
- **FM Core:** proteção técnica durante execução de IA, medição real de
  prompts/input-output-cached tokens, tentativas de fallback, áudio,
  latência, custo interno e quotas por tenant/unidade. Core não define
  plano, cobrança, contrato do cliente ou entitlement comercial.

## Regras de billing e FinOps

- Todo lançamento comercial deve vincular `product_id`, `tenant_id`,
  `subscription_id`, `plan_code`, `plan_revision`,
  `period_start/end` e uma referência idempotente da transação.
- Gasto com OpenAI/Gemini/outros providers pertence à FM Tecnologia
  quando a chave é FM-managed, **não ao cliente**; a assinatura paga pelo
  cliente é uma receita comercial separada.
- Painel Command deve exibir: consumo agregado e por SaaS/plano/tenant,
  contagem de tokens/áudio/requests, custo de IA FM, margem por plano,
  avisos de 70/80/90/100% configuráveis, limite atingido, upgrade e overage
  se houver decisão explícita.
- Preços, franquias, limites de tokens, número de unidades, usuários
  e demais allowances são versionados por plano e produto. Não fixar
  valores inventados no código nem usar tabela global sem `product_id`.
- Somente autoridade corporativa autenticada com MFA/step-up/RBAC adequado
  aprova/publica versão comercial de plano. Produto recebe revisão fixada
  por assinatura; Core recebe projeção técnica curta, autenticada e
  revogável, nunca dados livres enviados pelo navegador.
- Hard stop é a política técnica padrão em caso de quota de IA esgotada.
  Política de excedente e preços de upgrade é decisão comercial posterior.

## Gates internos e externos

Durante construção: implementar catálogo, versionamento, lifecycle,
contrato assinado Command→Assistant→Core, rate limits, concorrência
PostgreSQL16, painel e observabilidade com bancos descartáveis e mocks.

Somente após software 100%: conectar billing real, provedores de IA, Vault,
infraestrutura, endpoints e homologar contra serviços externos.
O adiamento de provas reais **não bloqueia construção**.

Referência de escopo:
`faabio3131/-FM-Assistant-Base/docs/governance/F3_F9_PLAN_QUOTAS_AND_AI_USAGE_ARCHITECTURE.md`.

**CURRENT comprovado:** Assistant tem catálogo versionado e leitor de licença;
Core tem motor transacional de reserva multi-métrica e adaptadores com tetos
de saída configuráveis. Os fluxos completos de sincronização comercial,
plano→licença→Core e UI do Command ainda precisam ser construídos.
