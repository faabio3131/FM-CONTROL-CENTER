# VendeAtendeIA P01 / F3 — pin final do Assistant após proteção de saldo

Data 22/10/2026. Core candidato `f09a552feb7e1115b9a91312f8de72e46d27f260` mantém a fila administrativa read-only de tentativas com custo/tokens desconhecidos. Assistant candidato `5fa69eb17c0126acb612d02892e7737136394fa4` contém o guard estrito de `MeterReading` para inteiros reais, revisão/franquia/duração válidas e saldo coerente.

Esta PR do Command repina o Assistant **após integração do WP F3**, preserva Core e executa no Foundation os testes de customer plan consumption e Core quota reader de forma isolada, além dos já existentes: sincronização comercial, reconciliação de licença C06, finops e signed Command→Assistant→Core com bancos descartáveis.

Sem alterar o catálogo FM, preços, assinatura financeira, credenciais, deploy, migration real ou tráfego de fornecedor. Status: candidato aguardando CI Foundation/Readiness/Cognitive completo, revisão interna, merge elegível e pós-merge. O selo `PROMPT_01_GREEN_INTERNO` não é concedido por esta PR isolada. Adaptadores de evidência por provider, alertas corporativos configurados e auditoria P01 final permanecem sob fechamento interno.
