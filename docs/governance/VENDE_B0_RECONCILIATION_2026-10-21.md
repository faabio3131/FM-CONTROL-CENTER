# VendeAtendeIA — B0: reconciliação interna

Data: 21/10/2026, America/Sao_Paulo. Candidata: Command PR #124.
Estado: IMPLEMENTADO, CERTIFICAÇÃO CI PENDENTE. B0 ainda não encerrado.

## Inventário verificado por diff

| PR | Tratamento na candidata | Evidência de preservação |
|---|---|---|
| #114 | substituída funcionalmente por #120 | produção idêntica; testes diferem apenas em linha em branco |
| #118 | incorporada | QR signer, sender, API, editor e testes idênticos |
| #119 | incorporada | gate de licença suspensa/quotas e envelope preservados |
| #120 | incorporada | revalidação após ACK e seleção de lote sem starvation, com testes PG |
| #121 | incorporada | signer de security hold e contratos negativos preservados |
| #122 | política preservada, API read-only recuperada | #124 já exporta validador de calendário equivalente; rota e três testes estavam ausentes |
| #123 | evolução mantida em #124 | schema aditivo, rotas, calendário e contratos; alterações posteriores não revertidas |
| #124 | candidata canônica | C06, contratos e evolução comercial, acrescidos dos WPs acima |

Nenhuma PR original é fechada antes de a candidata passar CI e ser integrada.
IRON/Kordena e PR #62 permanecem fora desta reconciliação. Nenhuma segunda
autoridade de tenant, licença ou billing foi introduzida.

## Contratos e separação de homologação

Foundation passa a executar conjuntamente os sete contratos Python/Node:
identidade, recuperação de consumo, três processos, licença/quota, transição
comercial, QR e security hold. Pins: Assistant `8279f3c10993ace277f713c01688a3412fc3e92a`,
Core `6434dd81c056f5f3162f11aa6f624c625ceb4702` (3/3 e 2/2 gates certificados).

Billing PostgreSQL agora executa também após push em main. Preview Deployment
Gate passa a workflow_dispatch exclusivamente: consulta rede/Render reais e
portanto pertence à homologação externa, não à construção interna. Os gates
Foundation, Billing PostgreSQL, F21 e Cognitive permanecem obrigatórios.

Leitura do Render em 21/10/2026 confirmou o serviço `fmcc-preview-web`
`srv-danhfirtqb8s73bug4ag`, repositório FM-CONTROL-CENTER, branch main,
`autoDeploy=no`, `autoDeployTrigger=off`, previews OFF. Nenhuma configuração
ou deploy foi modificado. Merge de código não autoriza ativação real.

## Auditoria interna em passe separado

- Comparação dos arquivos de cada PR com a candidata: nenhum arquivo funcional
  único descartado; API de política recuperada, nomenclatura de validador mantida.
- QR deriva organização/revisão/duração da persistência corporativa e exige
  owner/admin, commercial:write, step-up do mesmo ator, pré-auditoria e flag OFF.
- Security hold é signer puro e protocolo distinto de inadimplência.
- Guardas de pagamento revalidam invoice/provider/plano sob lock após ACK;
  falha preserva claim e bloqueio, sem reenvio cego.
- A política consultiva não autoriza execução; tenant externo/staff/ausência de
  permissão são negados, e a resposta não é cacheável.
- C06 permanece parcial: produtor PSP, snapshots/consentimento e lifecycle
  completo são construção B1. Não certificar produto completo nem produção.
- Auditoria feita pelo executor conforme autorização humana; não é aprovação
  de revisor independente e não será apresentada como tal.

## Validação e rollback

Lint sem erros (sete warnings legados fora do escopo); typecheck passou.
A primeira tentativa de suíte completa local falhou por falta de
BETTER_AUTH_SECRET/banco descartável; 698 testes passaram, 22 suítes falharam
no bootstrap. Isso NÃO é gate verde. Suite SQL completa, migrations, restore,
contratos cross-runtime, E2E, build e Docker dependem da execução dos quatro
workflows no HEAD candidato. Resultados definitivos devem ser verificados
antes do merge; não herdar o CI do commit anterior.

Rollback: reverter o commit de integração no Git; não aplicar downgrade no
banco real. A migration 0015 só é executada em bancos descartáveis nesta etapa.
Após CI verde: conferir head/base, merge com expected_head_sha, conferir quatro
workflows pós-merge e registrar evidência. Próximo bloco: B1, fechar lacunas
internas F3/C06; nenhuma homologação externa antecipada.

## Correção do contrato descoberta pelo gate conjunto
Foundation run `39537380245` em `dae5774889a81e36887dc71b56020003a1fdbe87`
falhou nos dois testes de recuperação: o Core atual exige `transport_key`, mas
Command e harness ainda usavam somente JWT. PostgreSQL/F21/Cognitive passaram.
Causa raiz: pins antigos escondiam incompatibilidade entre os repositórios.

Corrigidos sender Command e servidores sintéticos: identidade técnica dedicada
`recoveryServiceKey`, header `X-FM-Recovery-Service-Key`, validação antes de rede,
RSA >=2048 e payload sem segredo. Os testes agora exigem 401 tanto para JWT
isolado quanto para chave técnica isolada, além de 204 com ambas, 409 no replay
e ledger/audit único. Não relaxada nenhuma barreira do Core. Seis testes Node
passaram e typecheck passou; executar novamente os quatro workflows finais.

## Integração comprovada e correção de gatilho pós-merge
PR #124 integrada à main em `2a041d282a0135c02a36daef53fcc6fb90100705`.
HEAD certificado `840a7c8ae3680dadc9a78c41a7495f7a4f19bcdd`: Foundation
`39537845519`, Billing PG `39537845531`, F21 `39537845567`, Cognitive
`39537845532`, todos SUCCESS. Os seis contratos locais também passaram.
As PRs #114/#118–#123 foram encerradas como substituídas, preservando seus
corpos e referências de supersessão. Nenhum merge duplicado.

A verificação pós-merge revelou um erro nesta descrição inicial: Cognitive
ainda tinha push restrito à branch histórica, portanto só três workflows
foram disparados na main. Esta correção adiciona main à lista, preservando
a branch anterior e todos os testes. Não declarar quatro gates pós-merge
antes da nova evidência. O gate externo do Preview permanece manual.

### Reconciliação adicional da PR #125

A PR #125 (HEAD `0d5f75bf26a848b0cde90e00092cfe1369c326aa`) também sobrepunha o contrato de recuperação integrado na #124. Preservamos os pins mais recentes de Assistant/Core e o lock atual (Rolldown 1.2.14), sem regressão para versões antigas da #125. Incorporamos a rejeição de reutilização de issuer/audience/PEM como chave de serviço, com teste negativo antes de qualquer rede. A recuperação do binding nativo no CI passa a corresponder ao lock 1.2.14. A #125 só pode ser encerrada como substituída após merge verde desta correção.
