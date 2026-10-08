# Asaas — primeira integração FM (conta PF)

**Status:** adaptador base criado em PR #62; **não conectado, não autenticado em conta real, sem homologação e sem pagamentos ativos**.

## Decisão operacional

- Iniciar pela conta Asaas já criada pelo responsável da FM, **pessoa física (CPF)**.
- Não criar uma segunda conta nem exigir CNPJ agora apenas para codificar o adaptador.
- Validar posteriormente, diretamente no painel/atendimento Asaas, se a situação cadastral PF permite os métodos de cobrança, recorrência, faturamento e recebimento desejados. A possibilidade técnica de usar API não equivale à aprovação da operação comercial/tributária.
- A conta pertence exclusivamente ao **billing tenant FM**, e os clientes futuros do Command deverão cadastrar suas **próprias** contas. Não misturar recebedores.
- A conta PF futura poderá ser substituída por PJ sem reatribuir pagamentos históricos ou reescrever identificadores comerciais.

## API e ambientes oficiais

- Sandbox: `https://api-sandbox.asaas.com/v3`.
- Produção: `https://api.asaas.com/v3`.
- Chaves exclusivas por ambiente. A chave precisa ser criada no painel Asaas; nunca inserida no repositório, chat, frontend ou logs.
- `asaas-connector.ts` apenas constrói requisições GET estritamente permitidas; **não envia requisições nem gera cobranças**. Chave deve ser resolvida no servidor a partir do vault tenant-scoped.
- Para testar será preciso criar conta sandbox separada: https://sandbox.asaas.com/.

## Próximos gates do adaptador

1. Confirmar situação cadastral e disponibilidade da conta PF para os meios de recebimento pretendidos; selecionar banco/recebedor correto.
2. Configurar conta Asaas sandbox da FM, chave no cofre autenticado e validar identidade da conta recebedora.
3. Implementar cliente API server-side robusto com timeout, rate limiting, allowlist fixa, tratamento de erros e mascaramento de secrets.
4. Implementar e testar cobranças, assinaturas e eventos de webhook com token validado, idempotência e reconciliação independente; nenhuma criação de cobrança sem referências canônicas do Command.
5. Validar movimentos financeiros em sandbox, separação de tenants e reversibilidade de falhas.
6. Aprovação humana de conta produção, ativação, migração comercial e cutover em etapa independente.

**Não ativar cobranças reais, não mover assinaturas Kordena/AtendeVendeIA e não tratar conta cadastrada como conta verificada.**

Fontes: https://docs.asaas.com/docs/sandbox ; https://docs.asaas.com/docs/chaves-de-api ; https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook .
