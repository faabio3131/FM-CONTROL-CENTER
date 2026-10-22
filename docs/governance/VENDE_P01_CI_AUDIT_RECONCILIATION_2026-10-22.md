# VendeAtendeIA — reconciliação P01 de governança e auditoria npm (22/10/2026)

O AGENTS.md atual do Command já contém protocolo de autonomia, cronograma B0–B11, gates no SHA, proibições de deploy e regra de auditoria FM. A PR legada #147 continha grande duplicação textual e foi criada antes das PRs #152–#157. Este WP **não** reaplica o AGENTS histórico nem cria governança paralela; conserva as regras da main.

**Diff exclusivo migrado da #147:**
- `scripts/runtime-dependency-audit.sh` executa **o mesmo** `npm audit --omit=dev --audit-level=high` com limite de tentativas em falhas *transitórias de rede* do registry e erro final se continuar indisponível.
- Vulnerabilidade HIGH ou CRITICAL confirmada (inclusive se ocorrer junto a erro de rede) falha imediatamente, sem retry; testes de shell em ambiente mockado abrangem clean, vulnerable, mixed, recover e offline.
- Foundation, F21 e Cognitive usam o helper; F21 executa regressão que comprova fail-closed. Não usar `--force`, `--offline` ou `continue-on-error`.
- Não remover gates originais, pin de Core/Assistant, testagem integrada, E2E, dependência do registry ou scans.

**Meta:** o registry npm eventualmente indisponível não deve causar falha ao primeiro timeout, mas tampouco pode fazer a FM considerar audit incompleto como limpo. Não equiparar 4/4 CI com produção/homologação.

**Estado herdado:** PR #155 integrada `f163bf62b07ea61d9224fe1a5c8c40c085ed3db0` (pin F3 Core); #156 integrada `2fb26e5449ad0cb2c00252428638717cdbfad7a9` (risco de suspensão); #157 integrada `a67702007538f5fc71ab683e298912d17d7d1d4b` (histórico P01). Assistant/Core PR #1 Draft permanecem entregas a consolidar e F3/B1 global continua aberto.

**Gate:** CI Foundation, F21, Cognitive no HEAD, sem dispensa de auditoria; diff revisado e eventual merge autorizado FM. A PR #147 será encerrada como substituída somente após o conteúdo útil ter sido integrado. Nenhuma credencial real, VPS, deploy, cobrança ou teste externo.
