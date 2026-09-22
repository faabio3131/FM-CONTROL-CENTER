export function rotuloStatusProduto(status: string): string {
  if (status === "active") return "Ativo";
  if (status === "inactive") return "Inativo";
  return "Estado desconhecido";
}

export function rotuloCategoriaProduto(category: string): string {
  switch (category) {
    case "acquisition": return "Aquisição";
    case "activation": return "Ativação";
    case "engagement": return "Engajamento";
    case "revenue": return "Receita";
    case "churn": return "Cancelamento";
    case "health": return "Saúde operacional";
    default: return "Categoria";
  }
}

export function rotuloAtualidade(status: string): string {
  switch (status) {
    case "fresh": return "Atual";
    case "delayed": return "Com atraso";
    case "stale": return "Desatualizada";
    case "unknown": return "Desconhecida";
    case "unavailable": return "Indisponível";
    default: return "Desconhecida";
  }
}

export function rotuloQualidade(status: string): string {
  switch (status) {
    case "verified": return "Verificada";
    case "reconciled": return "Reconciliada";
    case "partial": return "Parcial";
    case "estimated": return "Estimada";
    case "unknown": return "Desconhecida";
    case "missing": return "Ausente";
    default: return "Desconhecida";
  }
}

export function rotuloStatusDefinicao(status: string): string {
  if (status === "implemented") return "Implementada";
  if (status === "pending_semantics") return "Semântica pendente";
  return "Estado desconhecido";
}

export function rotuloEstadoComparacao(status?: string): string {
  switch (status) {
    case "comparable": return "Comparável";
    case "unavailable": return "Indisponível";
    case "pending_semantics": return "Semântica pendente";
    case "incompatible_currency": return "Moedas incompatíveis";
    case "incompatible_period": return "Períodos incompatíveis";
    default: return "Estado desconhecido";
  }
}

export function mensagemEstadoComparacao(status?: string): string {
  switch (status) {
    case "comparable":
      return "Os dados atendem aos critérios de comparação governada.";
    case "unavailable":
      return "Ainda não existem dados governados suficientes para comparar estes produtos.";
    case "pending_semantics":
      return "A definição semântica desta métrica ainda não foi aprovada.";
    case "incompatible_currency":
      return "Os valores usam moedas diferentes e não há política de conversão aprovada.";
    case "incompatible_period":
      return "Os valores pertencem a períodos diferentes e não podem ser comparados diretamente.";
    default:
      return "Não foi possível determinar o estado da comparação.";
  }
}

export function rotuloDirecaoCrescimento(direction?: string): string {
  if (direction === "increased") return "Aumentou";
  if (direction === "decreased") return "Diminuiu";
  if (direction === "unchanged") return "Permaneceu estável";
  return "Indisponível";
}

export function rotuloUnidade(unit?: string): string {
  switch (unit) {
    case "count": return "contagem";
    case "currency": return "valor monetário";
    case "ratio": return "proporção";
    case "percent": return "percentual";
    case "seconds": return "segundos";
    default: return "unidade";
  }
}

export function mensagemErroCadastroProduto(code?: string): string {
  switch (code) {
    case "product.slug_conflict":
      return "Já existe um produto com esse identificador.";
    case "product.definition_invalid":
      return "Os dados informados para o produto são inválidos.";
    case "security.authentication_required":
      return "Sua sessão expirou. Entre novamente.";
    default:
      return "Não foi possível cadastrar o produto.";
  }
}

export function mensagemErroComparacao(code?: string): string {
  if (code === "product.compare_scope_invalid") {
    return "Selecione entre dois e oito produtos válidos para comparar.";
  }
  if (code === "product.compare_metric_required") {
    return "Selecione uma métrica para comparar.";
  }
  return "Não foi possível realizar a comparação.";
}
