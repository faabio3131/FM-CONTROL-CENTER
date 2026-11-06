# Command ↔ NFCore — marco P1/P4, 06/11/2026

## Repositórios, autoridades e PRs
- Destino: `faabio3131/FM-CONTROL-CENTER`, PR #204, branch `feat/command-nfcore-commercial-s2s-p1-20261106`.
- Origem: `faabio3131/nf-core-v001`, PR #372, branch `feat/nfcore-commercial-authority-p0-20261106`.
- Dependência de segurança: FM Command PR #205, `better-auth@1.7.12`/Drizzle 1.7.12, CI F21+Foundation aprovados. PR #205 aguarda revisão independente e não foi mesclada.
- Executores não promovem alterações produtivas, secrets ou homologação fiscal no Git.

## Entrega real P1 — primeiro contrato cognitivo (não comercial)
- O Source Registry e `connector-composition.ts` agora reconhecem **um conector exclusivo** `nfcore-cognitive-metrics-v1`, sem herança Kordena/IRON.
- Envio GET a `/v1/command/cognitive/metrics` do NFCore via bearer dedicado por `env:FMCC_NFCORE_CONTROL_PLANE_TOKEN`, `X-Correlation-Id`, HTTPS origin allowlisted e tenant Command explicitamente limitado.
- Input deve ter `sourceType`, `mappingVersion`, `productId`, `authoritativeDomain=cognitive`, `syncMode=pull`; sem segredo no código ou JSON. Dados não confiáveis são validados e perdas de acesso levam a erro (fail closed).
- Projeta somente `nfcore.cognitive.process_snapshot`: janela de processo, contagem de chamadas, tokens entrada/saída, custo quando efetivamente reportado e proveniência. Dados por tenant enviados pelo NFCore são **descartados**, sem exposição a outro cliente. Contadores são monotônicos POR PROCESSO, reinício muda `since`; não são faturamento, atribuição tenant nem consumo contratual.
- Manifestos comerciais C08 permanecem **exclusivos** de conectores capazes de `commercial.snapshot` + `commercial.facts`. É proibido anunciar as capacidades comerciais inexistentes no conector cognitivo.
- O `C08 local_contract_ready` significa somente verificação estrutural; `authenticatedSaasE2eCertified` continua falso até handshake real testado e documentado.

## Entrega real P4 — visual sem fabricar fatos ou poder
- Home Command apresenta console no rodapé com até 6 eventos reais do Activity Feed. O serviço já aplica `audit:read`, tenant e projeção governada; cada linha inclui timestamp, ator (quando informado), tenant atual, ação, status e origem/correlação quando informados. **Não é prova de imutabilidade por si só:** imutabilidade depende do Audit Ledger canônico.
- Command Core exibe distinção entre **Recomendação IA** (violeta) e **Autoridade Determinística** (neutra); texto não transforma sugestão da IA em mutação/autorização.
- Estilos adicionais usam modo escuro `#020817`, `rgba(6,17,43,.94)`, tratamentos verde/âmbar/vermelho somente para status conhecidos.

## Pendências obrigatórias — NÃO declarar concluído
1. **P1 comercial real**: criar endpoint NFCore somente leitura em dados duráveis para plano versionado, status da assinatura, trials (incluindo expiração), pagamento reconciliado, documentos reservados/emitidos e quota IA por TENANT autorizado. Fonte de MRR/faturamento deve ser o billing canônico Command; nunca calcular MRR a partir dos contadores em memória.
2. Assinar/vincular a identidade S2S nos dois lados, cadastrar secret em cofre e source no banco produtivo, homologar acesso negativo (tenant errado, falta de conexão, token expirado) e reprocessamento idempotente. Não reutilizar Kordena.
3. **P0 enforcement transacional**: conectar guardas de CNPJ/docs/RPM ao ledger fiscal antes de fila/provedor, teste de concorrência real e replay, sem habilitar entrega externa sem homologação.
4. **P3 mTLS/A1**: somente mostrar expirado/<=30d quando NFCore tiver fonte autenticada por tenant com `expiresAt`, carimbo temporal, status TLS/provedor e fonte canônica. Sem credenciais, mostrar Indisponível. O NFCore já possui `certificate_expiry_signal` e preflight A1, mas ainda falta export seguro e painel.
5. **Kill Switches P3**: só habilitar botões depois de existir comando assinado e auditado que efetivamente isole a fila/tenant no runtime NFCore, com dupla confirmação, RBAC, escopo exato, idempotência, step-up, histórico, confirmação de leitura e rollback governado. Os kill switches atuais `controlled_pilots.py` são **somente HOMOLOGAÇÃO**, não são emergência em produção.
6. NFCore `/v1/public/trial-plans` e release comercial continuam dependentes de instalação de rate-limit distribuído, entrega de ativação, identidade de produção, política publicada em pricing_admin e aprovação de release; 404 observado na produção e nunca resolvido por criar um fallback aberto.
7. Dependência da PR #205, CI de ponta a ponta, revisão independente e autorização de deploy Contabo.

## Gates
- Testes unitários específicos criados: contrato da telemetria NFCore, cross-tenant/HTTPS/secret, consistência de snapshots, terminal governado e semântica IA.
- CI pré-merge obrigatória; a PR permanece Draft e sem deploy. Nenhuma métrica da integração é inventada e nenhuma fonte foi afirmada como conectada em produção.
