# FM Command — Auditoria funcional de navegação (06/11/2026)

## Escopo e evidência
- Revisado o catálogo de 27 páginas de dashboard, 96 handlers de API e 76 TSX de dashboard (páginas e componentes) na `main@86910043510ad648096f00c6110281009fc619c2`.
- Inspecionados os botões de formulários e controles nas principais superfícies: fontes, busca, alertas, notificações, identidade, cobrança, planos e operações.
- **F14 confirmada incompleta:** cartões de métricas estavam em `article.metric-card`, sem ações de navegação; a tela mostrava ausência de serviços monitorados e telemetria não conectada, mas não permitia investigar cada indicador.
- Os controles HTML identificados nos componentes consultados usavam handlers ou envio de formulário; isso **não certifica** a resposta E2E de cada API, nem funcionamento em produção.
- Cards puramente informativos de outras telas não foram arbitrariamente transformados em ações sem destino real. Revisão funcional de jornadas e dados de cada domínio permanece necessária.

## Correção implementada nesta PR
- F14 agora transforma 4 cartões de saúde e 7 de métricas em links navegáveis acessíveis, com detalhamento de estado, valor e autoridade.
- Ao selecionar um cartão, a própria rota mostra painel com dados canônicos existentes, filtro da condição do serviço, observação temporal, proveniência e fechamento. A navegação usa âncora para abrir o painel sem caça manual da informação.
- Visão separada de fontes de integração cadastradas: seu `status` persistido é mostrado como diagnóstico, **nunca confundido** com disponibilidade/uptime.
- Próximos passos para diagnóstico: Fontes e Integrações, Eventos de operações, Alertas, Filas financeiras, sempre condicionados às permissões.
- Nenhuma alteração de fonte da verdade, geração artificial de incidentes, publicação de SLO, webhook, banco/migração ou produção.

## Limites e pendências reconhecidas
- Nenhum serviço pode ser considerado monitorado apenas por estar cadastrado como source. Registros `monitored_services` e observações com proveniência continuam necessários.
- Incidentes, jobs, integrations e erros não podem ser detalhados em ocorrências individuais quando só houver métrica agregada, sem fonte de eventos. O link para Activity Feed faz a investigação de eventos já governados, quando houver.
- Percentuais históricos de uptime, consumo de infraestrutura e taxa de erro permanecem semânticas pendentes até existir série temporal, denominador e fonte aprovada.
- Não declarar outras telas nem jornadas completas a partir desta correção. Itens restantes devem ser reconciliados com o cronograma e ter correção própria.
