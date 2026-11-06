/** Port adaptado do FM Command V2 (gráfico HTML/CSS, sem biblioteca).
 * A largura é APENAS visual; valores exibidos vêm da fonte governada.
 * Um valor ausente nunca recebe barra que sugira zero.
 */
export interface BarChartItem {
  readonly id: string;
  readonly label: string;
  readonly valueText: string | null;
  readonly widthPercent: string;
}
export function BarChart({ items, ariaLabel, unavailableText }: {
  items: readonly BarChartItem[];
  ariaLabel: string;
  unavailableText: string;
}) {
  return (
    <ul className="fmcc-v2-bar-chart" aria-label={ariaLabel}>
      {items.map((item) => (
        <li className="fmcc-v2-bar-row" key={item.id} data-available={item.valueText !== null}>
          <span className="fmcc-v2-bar-label">{item.label}</span>
          <span className="fmcc-v2-bar-track" aria-hidden="true">
            {item.valueText !== null ? (
              <span className="fmcc-v2-bar-fill" style={{ width: `${item.widthPercent}%` }} />
            ) : null}
          </span>
          <strong className="fmcc-v2-bar-value">{item.valueText ?? unavailableText}</strong>
        </li>
      ))}
    </ul>
  );
}
