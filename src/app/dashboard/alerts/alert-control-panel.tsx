"use client";

import { FormEvent, useState } from "react";

type Rule = { id: string; metricId: string; operator: string; threshold: string; severity: string; productId?: string };
type Occurrence = { id: string; metricId: string; observedValue: string; threshold: string; severity: string; status: string };
type Product = { id: string; name: string };
type Metric = { metricId: string; displayName: string };

export function AlertControlPanel(props: {
  rules: readonly Rule[];
  occurrences: readonly Occurrence[];
  products: readonly Product[];
  metrics: readonly Metric[];
  canWrite: boolean;
  canPrepare: boolean;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as {
        error?: string;
        preview?: { riskLevel?: string; reason?: string };
        evaluation?: { status?: string; reason?: string };
        occurrence?: unknown;
        created?: boolean;
      };
      if (!response.ok) {
        setMessage(payload.error ?? "Operação indisponível.");
        return null;
      }
      if (payload.preview?.reason) setMessage(`Preview ${payload.preview.riskLevel ?? ""}: ${payload.preview.reason}`);
      else if (payload.evaluation?.status === "unavailable") setMessage("Avaliação concluída: métrica indisponível; nenhum alerta criado.");
      else if (payload.evaluation?.status === "clear") setMessage("Avaliação concluída: threshold não atingido; nenhum alerta criado.");
      else if (payload.evaluation?.status === "incompatible") setMessage("Avaliação concluída: valor incompatível; nenhum alerta criado.");
      else setMessage("Operação registrada com sucesso.");
      return payload;
    } catch {
      setMessage("Não foi possível concluir a operação.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await request("/api/alerts", {
      metricId: String(data.get("metricId") ?? ""),
      productId: String(data.get("productId") ?? "") || undefined,
      operator: String(data.get("operator") ?? ""),
      threshold: String(data.get("threshold") ?? ""),
      severity: String(data.get("severity") ?? ""),
      idempotencyKey: crypto.randomUUID(),
    });
    if (result) window.location.reload();
  }

  return (
    <section className="alert-control" aria-labelledby="alert-control-title">
      <div className="section-heading">
        <div><span className="eyebrow">Políticas determinísticas</span><h2 id="alert-control-title">Configuração e ações</h2></div>
        <p>Ações críticas não são executadas pelo Core. F17 gera somente intents/previews auditáveis.</p>
      </div>

      {props.canWrite ? (
        <form className="alert-rule-form" onSubmit={createRule}>
          <label>Métrica<select name="metricId">{props.metrics.map((metric) => <option value={metric.metricId} key={metric.metricId}>{metric.displayName}</option>)}</select></label>
          <label>Produto<select name="productId"><option value="">Global</option>{props.products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
          <label>Operador<select name="operator" defaultValue="gt"><option value="gt">&gt;</option><option value="gte">≥</option><option value="lt">&lt;</option><option value="lte">≤</option><option value="eq">=</option></select></label>
          <label>Threshold<input name="threshold" inputMode="decimal" required placeholder="Ex.: 10" /></label>
          <label>Severidade<select name="severity" defaultValue="warning"><option value="info">Informativa</option><option value="warning">Atenção</option><option value="critical">Crítica</option></select></label>
          <button className="button primary" disabled={busy} type="submit">Criar regra</button>
        </form>
      ) : <p className="empty-state">Seu papel possui leitura de alertas, mas não pode criar ou avaliar regras.</p>}

      <div className="alert-list">
        {props.rules.length ? props.rules.map((rule) => (
          <article className="alert-item" key={rule.id}>
            <div><strong>{rule.metricId}</strong><span>{rule.operator} {rule.threshold} · {rule.severity}</span></div>
            {props.canWrite ? <button className="button" disabled={busy} onClick={async () => {
              const result = await request("/api/alerts/evaluate", { ruleId: rule.id });
              if (result?.occurrence) window.location.reload();
            }}>Avaliar agora</button> : null}
          </article>
        )) : <div className="empty-state"><strong>Nenhuma regra configurada.</strong><p>Alertas não são inventados sem regra/threshold explícitos.</p></div>}
      </div>

      <div className="alert-list">
        {props.occurrences.length ? props.occurrences.map((occurrence) => (
          <article className="alert-item" key={occurrence.id}>
            <div>
              <strong>{occurrence.metricId} · {occurrence.severity}</strong>
              <span>Observado {occurrence.observedValue} · threshold {occurrence.threshold} · {occurrence.status}</span>
            </div>
            <div className="alert-actions">
              {props.canWrite && occurrence.status === "active" ? <button className="button" disabled={busy} onClick={async () => {
                const ok = await request("/api/alerts/acknowledge", { occurrenceId: occurrence.id });
                if (ok) window.location.reload();
              }}>Reconhecer</button> : null}
              {props.canPrepare ? <button className="button" disabled={busy} onClick={() => request("/api/alerts/actions/preview", {
                occurrenceId: occurrence.id,
                actionType: "investigate",
                idempotencyKey: crypto.randomUUID(),
              })}>Preparar investigação</button> : null}
            </div>
          </article>
        )) : null}
      </div>

      {message ? <p className="alert-feedback" role="status">{message}</p> : null}
    </section>
  );
}
