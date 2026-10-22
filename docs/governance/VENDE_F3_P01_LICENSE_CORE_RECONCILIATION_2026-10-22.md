# VendeAtendeIA — F3/P01 licenciamento e quotas Command → Assistant → Core

**Data:** 22/10/2026 · **Tipo:** certificação interna sintética com execução real de código de três repositórios em bancos descartáveis, não homologação externa.

## Reconciliação de fonte de verdade

- **FM Command:** autoridade contratual, faturamento, preços e aplicação das transições assinadas C06. O fluxo P01 de reparação controlada foi incorporado à main na PR #152; seu ACK financeiro/Assistant não atesta sozinho a possibilidade de consumo no Core.
- **FM Assistant:** estado atual da licença por tenant, unidade e período, inclusive suspensões/revogações/expiração. Apenas licença ativa/trial válida gera `LicensedQuotaManifest` e concessões assinadas.
- **FM Core:** valida a concessão assinada em cada requisição, sem confiar em grants em cache. Reserva quotas e recursos antes de chamar qualquer modelo; texto e áudio consomem a franquia única, mantendo histórico de reservas independentemente das mudanças de licença.

## Trabalho reaproveitado

A PR #150 original tornou-se divergente de `main` após a PR #152. Esta candidata conserva seu conteúdo exato nos quatro arquivos de validação de plano e testes, preservando a lógica já certificada sem iniciar outro subsistema ou reimplementar billing. Os números de limites de IA configuráveis no Command agora ficam dentro da faixa que os grants do Core podem cumprir: no máximo **2.000.000.000 unidades** e **31.536.000 segundos** para cinco métricas de IA assinadas, sem limitar funcionalidades por plano. Métricas não-Core mantêm limites próprios.

## Matriz operacional que a certificação cobre

| Situação | Assistant / Core | Resultado |
|---|---|---|
| Command publica plano AI válido | Assistant recebe licença e grants versionados | Core reserva tokens e requests |
| Texto e áudio no mesmo tenant | Grants do Assistant em ambas capacidades | Contagem compartilhada, não duplicada |
| Segundo tenant ou unidade inexistente | Política não pode ser emitida | Negação antes de reserva |
| Suspensão assinada C06 | Assistant marca suspensão | Requisições Core novas negadas sem refund de reservas anteriores |
| Mesmo envelope de alteração em replay | Nonce/replay protection | Negação |
| Reativação assinada e verificada | Assistant volta a ativo com nova vigência | Core aceita nova concessão fresca, preservando consumo anterior |
| Transporte Assistant inacessível | Autoridade assinada não recuperável | Core falha fechado; não inventa acesso liberado |
| Licença posteriormente expirada | Grant antigo não é suficiente | Core nega imediatamente, mantendo contabilização |

**Prova de âmbito:** as suítes `tests/f3_command_commercial_transition_contract.py` e `tests/f3_command_license_quota_journey.py` importam código real de Assistant e Core, executam o signer Command em Node, persistem estados em SQLite isolado e verificam quotas reais Core; testes de `assistant-consumption-plan` verificam compatibilidade de limites no TypeScript.

## Gates de certificação

CI Foundation cross-runtime (Node/Python/Assistant/Core), Billing PostgreSQL, F21 e Cognitive no SHA da PR. Ao fechar certifique `main` e checks pós-merge se retornados. Nenhuma informação de "licença Core ativa" deve ser materializada no painel de P01 sem um endpoint autenticado e consultado em tempo real: `coreQuotaVerified=false` continua intencionalmente enquanto esse readback corporativo não existir.

**Pendências reais:** a API read-only Command → Core para verificar autoridade e quotas (sem criar reservas); integração no painel do caso P01; consolidação das branches draft dos repositórios Assistant e Core; testes de rede reais somente **após BUILD_COMPLETE_INTERNAL_GREEN**. Não declarar encerramento integral do SaaS nem homologação externa nesta fase.
