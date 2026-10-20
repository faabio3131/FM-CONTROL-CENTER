# ADR-016 — Pré-condições de execução contratual C06 com autoridade explícita
Data: 2026-10-20
Estado: candidata em branch, revisão e decisão comercial pendentes

## Contexto
FMCC já dispõe de registros de assinatura/fatura, reconciliador IRON, outbox de entrega e intenção auditada, mas não tem políticas aprovadas e versionadas de vigência, reembolso, prorrata, tolerância e renovação. Confundir informação de prévia com autorização financeira causaria risco de cobrança e acesso indevidos.

## Decisão de engenharia
Formalizar contrato fmcc.c06.execution-prerequisites.v1, com conjunto de autoridades por ação. Cada evidência futura deve ter identificadores de tenant/produto/assinatura/ação, revisão, referência de fonte, timestamp de verificação e validade. Nunca aceitar tais alegações do frontend, header livre ou LLM.
Avaliação somente leitura com falha segura quando faltar prova, escopo, revisão ou validade. Mesmo com evidências completas, este componente responde executionAuthorized=false; executor financeiro será separado e revalidará autorização, estado e provas em transação antes de acionar gateway/vertical.

## Alternativas
1. Usar status active/past_due da tabela de assinatura como prova para renovar ou cancelar: rejeitada; faltam vigência e confirmação de gateway.
2. Executar imediatamente após intent com senha: rejeitada; step-up prova identidade, não política nem liquidação.
3. Criar defaults globais de prorrata, cancelamento e tolerância: rejeitada; são decisões comerciais não aprovadas.
4. Contrato de pré-condições explícitas, fail-closed e executor futuro segregado: escolhida.

## Implicações
Plano versionado e matriz por SaaS deverão ser aprovados por humano; adapters de gateway e vertical devem prover evidências verificáveis, sem delegar autoridade à IA. Custos de armazenamento de evidências, prazos, transações e eventual migration serão estimados antes do executor. Runtime indisponível não é zero. A fase C06 segue parcialmente construída, não pronta comercialmente.

## Gates
Lint, TypeScript, testes de negação e escopo, build, CI no SHA, revisão independente e compatibilidade com IRON #142/#143. Execução financeira e deploy dependem de autorização e certificação separadas.
