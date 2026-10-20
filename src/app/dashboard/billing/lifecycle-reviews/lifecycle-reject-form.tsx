"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
const LIFECYCLE_REJECTION_REASONS = ["insufficient_evidence", "policy_unavailable", "duplicate_request", "operator_declined"] as const;
type LifecycleRejectionReason = typeof LIFECYCLE_REJECTION_REASONS[number];

const reasons: Record<LifecycleRejectionReason, string> = {
  insufficient_evidence: "Documentação ou comprovação insuficiente",
  policy_unavailable: "Política comercial ainda indisponível",
  duplicate_request: "Solicitação duplicada",
  operator_declined: "Solicitação recusada na análise",
};

export function LifecycleRejectForm({ intentId }: { intentId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState<LifecycleRejectionReason>("insufficient_evidence");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const key = useRef<string | null>(null);
  async function submit() {
    if (busy || !confirmed || !password) return;
    if (!key.current) key.current = crypto.randomUUID();
    setBusy(true); setResult("");
    try {
      const response = await fetch(
        "/api/billing/lifecycle-reviews/" + encodeURIComponent(intentId) + "/reject",
        {
          method: "POST", cache: "no-store",
          headers: { "content-type": "application/json", "x-idempotency-key": key.current },
          body: JSON.stringify({ reason, password }),
        },
      );
      if (!response.ok) {
        setResult(response.status === 409
          ? "Recusa conflitante ou já registrada. Atualize a página antes de tentar novamente."
          : "Não foi possível confirmar a recusa. Verifique permissão, senha e estado.");
        return;
      }
      setResult("Recusa auditada. Nenhuma assinatura, cobrança ou licença foi modificada.");
      setPassword(""); setConfirmed(false); key.current = null;
      router.refresh();
    } catch {
      setResult("Conexão incerta. Verifique o histórico antes de repetir a solicitação.");
    } finally { setBusy(false); }
  }
  function changeReason(value: string) {
    if (!LIFECYCLE_REJECTION_REASONS.includes(value as LifecycleRejectionReason)) return;
    setReason(value as LifecycleRejectionReason); setConfirmed(false); key.current = null;
  }
  return <div className="product-create-form">
    <label>Motivo da recusa
      <select value={reason} disabled={busy} onChange={event => changeReason(event.target.value)}>
        {LIFECYCLE_REJECTION_REASONS.map(value =>
          <option key={value} value={value}>{reasons[value]}</option>)}
      </select>
    </label>
    <label>
      <input type="checkbox" checked={confirmed} disabled={busy}
        onChange={event => setConfirmed(event.target.checked)}/>
      Confirmo a recusa administrativa desta solicitação, sem execução financeira.
    </label>
    <label>Senha para reautenticação
      <input type="password" autoComplete="current-password" value={password} maxLength={128}
        disabled={busy} onChange={event => setPassword(event.target.value)}/>
    </label>
    <button type="button" className="button" disabled={!password || !confirmed || busy}
      onClick={() => { void submit(); }}>Registrar recusa auditável</button>
    {result ? <p role="status">{result}</p> : null}
  </div>;
}
