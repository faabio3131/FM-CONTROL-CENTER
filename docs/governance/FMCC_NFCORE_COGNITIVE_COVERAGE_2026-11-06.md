# FM Command C08 — Cobertura cognitiva NFCore (06/11/2026)

## Motivo
A PR #208 incluiu "Ver cobertura comercial" exclusivamente para fontes `kordena-commercial-v1` e `iron-commercial-v1`. A fonte NFCore `nfcore-cognitive-metrics-v1` permanece exclusivamente cognitiva. No painel do operador, em 06/11/2026, NFCore constava com última sincronização **nunca** e última tentativa **falhou**; origem registrada `https://api.nfcore.com.br`.

## Entrega
- Botão separado "Ver cobertura cognitiva", somente para o adapter NFCore, sem chamar o endpoint comercial de Kordena/IRON.
- Nova rota somente leitura `GET /api/sources/{sourceId}/cognitive-coverage`: owner/admin, sessão, `source:read`, `integration:read`, `metric:read`, fonte/adapter vinculados, produto NFCore ativo e mesmo tenant.
- Consulta autenticada por `NfcoreCognitiveConnector.pull()` ao endpoint NFCore canônico `/v1/command/cognitive/metrics`; usa validação, HTTPS allowlisted, bearer dedicado e validação de correlação já existentes.
- Projeção whitelist apenas dos contadores cognitivos: requisições, chamadas de modelo, tokens e custos quando explicitamente reportados. Nunca transmite mapa de tenants, payload bruto, prompts, CNPJ ou credenciais.
- Diferencia contadores de processo (reset após reinício), custos não informados (`null`) e dados reais de billing/quotas duráveis, que pertencem a outro contrato.
- Resposta `no-store` e auditada; falha na consulta não vira números zero nem estado "healthy".
- Sem mudança nos backends do NFCore, Kordena e IRON; sem migration, nova credencial, comando financeiro ou ativação externa.

## Diagnóstico operacional pendente
O endpoint já está previsto e implementado no código do NFCore em `src/kordena_fiscal/cognitive/command_api.py`, mas a captura da UI não comprova resposta HTTP autenticada em produção. Verificar token correto em ambas as pontas (`FMCC_NFCORE_CONTROL_PLANE_TOKEN` no Command e `NFCORE_COMMAND_CONTROL_PLANE_TOKEN` no NFCore), allowlist `FMCC_NFCORE_ALLOWED_ORIGINS`, escopo `FMCC_NFCORE_CONTROL_TENANT_ID`, roteamento do endpoint e logs S2S, sem expor valores de segredo.

## Gate e lançamento
Revisar PR no SHA exato, executar CI aplicável, revisão independente e merge somente com elegibilidade. Deploy Contabo exige autorização aplicável e validação de versão/rota. Nenhuma conexão NFCore E2E é certificada antes do teste remoto.
