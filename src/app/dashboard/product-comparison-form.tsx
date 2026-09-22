"use client";

import { FormEvent, useState } from "react";

type Product = { id: string; name: string; slug: string };
type ComparisonPayload = {
  metricId?: string;
  status?: "comparable" | "unavailable" | "pending_semantics" | "incompatible_currency" | "incompatible_period";
  values?: Array<{ product: Product; value: { value: string | null; unit: string; currency?: string } | null }>;
  error?: string;
};

const METRICS = [
  ["trial.starts.count", "Trials iniciados"],
  ["subscription.active.count", "Assinaturas ativas"],
  ["subscription.cancelled.count", "Cancelamentos"],
  ["billing.gross_billed", "Faturamento bruto emitido"],
  ["revenue.cash_collected", "Caixa recebido"],
] as const;

export function ProductComparisonForm({ products }: { products: readonly Product[] }) {
  const [result, setResult] = useState<ComparisonPayload | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const metricId = String(form.get("metricId") ?? "");
    const productA = String(form.get("productA") ?? "");
    const productB = String(form.get("productB") ?? "");
    if (!metricId || !productA || !productB || productA === productB) {
      setResult({ error: "Selecione dois produtos diferentes e uma métrica." });
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ metricId });
      params.append("productId", productA);
      params.append("productId", productB);
      const response = await fetch(`/api/products/compare?${params.toString()}`);
      const payload = await response.json() as ComparisonPayload;
      setResult(response.ok ? payload : { error: payload.error ?? "Comparação indisponível." });
    } catch {
      setResult({ error: "Comparação indisponível." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="comparison-panel">
      <form className="comparison-form" onSubmit={submit}>
        <label>Métrica<select name="metricId" defaultValue={METRICS[0][0]}>{METRICS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Produto A<select name="productA" defaultValue={products[0]?.id}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label>Produto B<select name="productB" defaultValue={products[1]?.id}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <button className="button" type="submit" disabled={loading}>{loading ? "Comparando…" : "Comparar"}</button>
      </form>
      {result ? (
        <div className="comparison-result" role="status">
          {result.error ? <p className="error">{result.error}</p> : (
            <>
              <strong>Estado: {result.status}</strong>
              {result.status === "comparable" ? (
                <ul>{result.values?.map(({ product, value }) => <li key={product.id}>{product.name}: {value?.value ?? "Indisponível"} {value?.currency ?? value?.unit ?? ""}</li>)}</ul>
              ) : <p>Os dados não são comparáveis de forma governada neste momento.</p>}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
