/** Adaptação dos gráficos do V2 a contagens já governadas do FMCC.
 * Não soma métricas de períodos diferentes, não infere zero para falta de fonte,
 * e preserva o texto da fonte como autoridade em comparações.
 */
export interface VisualBar {
  readonly id: string;
  readonly label: string;
  readonly valueText: string | null;
  readonly widthPercent: string;
}
export function countBars(
  inputs: readonly { id: string; label: string; count: number }[],
  hasObservations: boolean,
): readonly VisualBar[] {
  const allValid = inputs.every((item) => Number.isSafeInteger(item.count) && item.count >= 0);
  const available = hasObservations && allValid;
  const max = available ? Math.max(0, ...inputs.map((x) => x.count)) : 0;
  return inputs.map((x) => ({
    id: x.id,
    label: x.label,
    valueText: available ? String(x.count) : null,
    widthPercent: available && max > 0 ? String(Math.round((x.count / max) * 100)) : "0",
  }));
}
export interface ComparableMetricRow {
  readonly product: { readonly id: string; readonly name: string };
  readonly value: { readonly value: string | null; readonly unit: string; readonly currency?: string } | null;
}
/** Apenas proporção visual, nunca substitui o valor decimal literal do servidor. */
export function comparableBars(rows: readonly ComparableMetricRow[]): readonly VisualBar[] | null {
  if (rows.length !== 2 || rows.some(({ value }) =>
    !value || value.value === null || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.value)
  )) return null;
  const amounts = rows.map(({ value }) => Number(value!.value));
  if (amounts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const max = Math.max(...amounts, 0);
  return rows.map(({ product, value }, i) => ({
    id: product.id,
    label: product.name,
    valueText: `${value!.value} ${value!.currency ?? (value!.unit === "count" ? "" : value!.unit)}`.trim(),
    widthPercent: max > 0 ? String(Math.round(amounts[i]! / max * 100)) : "0",
  }));
}
