# FM CONTROL CENTER — F12–F15 MISSION LEDGER

**Baseline:** `2a276f4c57577bf0236ae134311705f294d31b21`  
**Branch:** `feat/fmcc-f12-f15-business-operations`  
**PR:** #12 — OPEN/DRAFT  
**Produção:** fora do escopo  
**F16:** proibida nesta tranche

## Gates

| Fase | Estado | Evidência |
|---|---|---|
| F11 pós-merge | PASS | Gate #192 SUCCESS |
| F12 Current Discovery | PASS | `FMCC-12-CURRENT-DISCOVERY-FINANCE-v0.1.md` |
| F12 System Design | PASS | `FMCC-12-FINANCIAL-UNIT-ECONOMICS-v0.1.md` |
| F12 implementação | EM EXECUÇÃO | branch/PR #12 |
| F12 gate | PENDENTE | não avançar F13 antes de verde |
| F13 | BLOQUEADA POR GATE F12 | System Design preparado, implementação aguarda F12 |
| F14 | BLOQUEADA POR GATE F13 | System Design preparado |
| F15 | BLOQUEADA POR GATE F14 | System Design preparado |

## Guardrails

- missing != zero;
- multi-moeda sem FX falha fechado;
- product/tenant isolation server-side;
- sem providers inventados;
- sem scores mágicos;
- Core cognitivo não substitui cálculo determinístico;
- PR permanece Draft;
- sem merge, produção ou F16.
