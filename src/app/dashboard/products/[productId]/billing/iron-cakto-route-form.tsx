"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const APPROVAL = "VINCULAR_CAKTO_IRON";
type State = "cakto_enabled" | "other_route" | "missing" | "unavailable";

export function IronCaktoRouteForm({ productId, state, canWrite }: { productId: string; state: State; canWrite: boolean }) {
  const router = useRouter();
  const [approval, setApproval] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || busy || approval !== APPROVAL || !password.trim()) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/billing/products/" + encodeURIComponent(productId) + "/iron-cakto-route", {
        method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
        body: JSON.stringify({ approval, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        const messages: Record<string, string> = {
          "billing.iron_cakto_runtime_not_configured": "As credenciais Cakto da FM ainda não estão configuradas no servidor. Nada foi alterado.",
          "billing.iron_cakto_route_conflict": "O IRON já recebe por outra conta. Nada foi alterado.",
          "billing.iron_cakto_account_not_enabled": "A conta Cakto cadastrada está desativada. Nada foi alterado.",
          "billing.iron_cakto_account_ambiguous": "Há mais de uma conta Cakto cadastrada. Nada foi alterado.",
          "security.step_up_required": "Senha não confirmada.",
        };
        setMessage(messages[result?.error] ?? "Vínculo não confirmado. Atualize a página antes de repetir.");
        return;
      }
      if (result?.provider !== "cakto" || result?.status !== "enabled" || result?.paymentExecuted !== false) throw new Error("unconfirmed");
      setMessage("Conta recebedora Cakto vinculada ao IRON. Nenhuma cobrança executada.");
      setApproval(""); router.refresh();
    } catch { setMessage("Resultado não confirmado. Atualize a página antes de repetir."); }
    finally { setPassword(""); setBusy(false); }
  }
  return <section className="panel" aria-label="Conta recebedora Cakto do IRON">
    <h2>Conta recebedora do IRON</h2>
    {state === "cakto_enabled" ? <p>Recebimentos do IRON vinculados à conta Cakto da FM (produção).</p> :
     state === "other_route" ? <p>O IRON está vinculado a outra conta recebedora. A troca não é feita por esta tela.</p> :
     state === "unavailable" ? <p>Não foi possível consultar a conta recebedora agora.</p> : <>
      <p>Vincula o IRON à conta Cakto da FM. As credenciais ficam no servidor e não aparecem aqui. É pré-requisito para publicar os planos. Não cria cobranças.</p>
      {canWrite ? <form className="product-create-form" onSubmit={event => { void submit(event); }}>
        <label>Confirme: {APPROVAL}<input value={approval} onChange={e => setApproval(e.target.value)} disabled={busy} required autoComplete="off" /></label>
        <label>Senha administrativa<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} required /></label>
        <button className="button" type="submit" disabled={busy || approval !== APPROVAL || !password.trim()}>{busy ? "Vinculando…" : "Vincular conta Cakto ao IRON"}</button>
      </form> : <p>Somente a administração FM pode vincular.</p>}
    </>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
