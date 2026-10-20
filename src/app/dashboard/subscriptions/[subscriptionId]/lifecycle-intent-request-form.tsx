"use client";
import { useRef, useState } from "react";
import type { LifecycleOption } from "@/domain/billing/subscription-lifecycle-policy";

/** Does not execute a transition; only writes a pending audit intent. */
export function LifecycleIntentRequestForm(props: {
  subscriptionId: string; recordedStatus: string; options: readonly LifecycleOption[];
}) {
  const options = props.options.filter(item => item.status === "candidate_for_review");
  const [action, setAction] = useState("");
  const [token, setToken] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const idempotency = useRef<string | null>(null);
  const endpoint = "/api/billing/subscriptions/" +
    encodeURIComponent(props.subscriptionId) + "/lifecycle-intents";
  function reset(next: string) {
    setAction(next); setToken(""); setPassword(""); setConfirmed(false);
    setMessage(""); idempotency.current = null;
  }
  async function prepare() {
    if (!action || busy) return;
    setBusy(true); setToken(""); setMessage("");
    try {
      const response = await fetch(endpoint + "/preview", {
        method: "POST", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, expectedStatus: props.recordedStatus }),
      });
      if (!response.ok) throw new Error("prepare failed");
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" ||
          !("token" in value) || typeof value.token !== "string" ||
          !("expiresAt" in value) || typeof value.expiresAt !== "string")
        throw new Error("invalid proof");
      setToken(value.token); setExpiresAt(value.expiresAt);
      idempotency.current = crypto.randomUUID();
      setMessage("Prévia emitida. Confira a operação antes de registrar.");
    } catch {
      setMessage("Prévia indisponível. Atualize os dados da assinatura.");
    } finally { setBusy(false); }
  }
  async function record() {
    if (!token || !confirmed || !password || !idempotency.current || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", cache: "no-store",
        headers: { "content-type": "application/json", "x-idempotency-key": idempotency.current },
        body: JSON.stringify({ action, expectedStatus: props.recordedStatus, token, password }),
      });
      if (!response.ok) {
        setMessage(response.status === 409
          ? "Prévia expirada, já utilizada ou estado alterado. Atualize a página."
          : "Pedido não confirmado; verifique acesso e estado antes de repetir.");
        return;
      }
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" ||
          !("state" in result) || result.state !== "awaiting_policy" ||
          !("executionAuthorized" in result) || result.executionAuthorized !== false) {
        setMessage("Resposta inesperada: verifique a auditoria antes de repetir.");
        return;
      }
      setMessage("Solicitação auditada para análise. Nenhuma cobrança ou licença foi alterada.");
      setAction(""); setToken(""); setConfirmed(false); idempotency.current = null;
    } catch {
      setMessage("Conexão incerta. Confira o registro antes de criar outro pedido.");
    } finally { setPassword(""); setBusy(false); }
  }
  if (options.length === 0) return <p>Nenhuma ação candidata neste estado.</p>;
  return <div className="product-create-form">
    <p>Registrar um pedido não altera assinatura, cobrança, plano ou licença.</p>
    <label>Operação
      <select value={action} onChange={event => reset(event.target.value)} disabled={busy}>
        <option value="">Selecione a operação</option>
        {options.map(item => <option key={item.action} value={item.action}>{item.title}</option>)}
      </select>
    </label>
    <button type="button" className="button" disabled={!action || busy}
      onClick={() => { void prepare(); }}>Gerar prévia auditável</button>
    {token ? <>
      <p>Prévia válida até {new Date(expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília).</p>
      <label><input type="checkbox" checked={confirmed} disabled={busy}
        onChange={event => setConfirmed(event.target.checked)}/>
        Confirmo somente o registro da solicitação para análise, sem execução automática.
      </label>
      <label>Senha para reautenticação
        <input type="password" autoComplete="current-password" maxLength={128}
          value={password} onChange={event => setPassword(event.target.value)} disabled={busy}/>
      </label>
      <button type="button" className="button" disabled={!confirmed || !password || busy}
        onClick={() => { void record(); }}>Registrar solicitação sem execução</button>
    </> : null}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
