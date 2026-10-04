export type GlobalSearchResultKind =
  | "navigation"
  | "metric"
  | "product"
  | "source"
  | "alert_rule";

export interface GlobalSearchResult {
  readonly id: string;
  readonly kind: GlobalSearchResultKind;
  readonly label: string;
  readonly description: string;
  readonly href: string;
  readonly authority: string;
}

export interface GlobalSearchOverview {
  readonly query: string;
  readonly items: readonly GlobalSearchResult[];
  readonly counts: {
    readonly totalMatches: number;
    readonly returned: number;
    readonly navigation: number;
    readonly metrics: number;
    readonly products: number;
    readonly sources: number;
    readonly alertRules: number;
  };
  readonly coverageNote: string;
}

export class GlobalSearchQueryError extends Error {
  constructor(message = "search.query_invalid") {
    super(message);
    this.name = "GlobalSearchQueryError";
  }
}
