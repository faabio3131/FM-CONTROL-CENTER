"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { parseIronCommercialAmount } from "@/domain/billing/iron-commercial-price-input";

export function IronCommercialPlanCreateForm({ productId, existingCodes, canWrite }: {
  productId: string;
  existingCodes: readonly string[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const planCode = String(values.get("planCode") ?? "").trim().toUpperCase();
    const name = String(values.get("name") ?? "").trim();
    const interval = String(values.get("interval") ?? "");
    const amountMinor = parseIronCommercialAmount(String(values.get("amount") ?? ""));
    if (!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(planCode) ||
        name.length < 2 || name.length > 120 ||
        (interval !== "monthly" && interval !== "yearly") || amountMinor === null) {
      setMessage("Confira os dados, o código e o preço em reais.");
      return;
    }
    if (existingCodes.includes(planCode)) {
      setMessage("Código já utilizado. Novas condições exigem outro código comercial.");
      return;
    }
    if (!password.trim()) {
      setMessage("Informe sua senha para confirmar o cadastro.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/billing/products/${encodeURIComponent(productId)}/plans`, {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ planCode, name, interval, amountMinor, status: "inactive", password }),
      });
      if (!response.ok) {
        setMessage(response.status === 403
          ? "Operação não autorizada. Verifique sua permissão e a confirmação administrativa."
          : "Não foi possível cadastrar. Confira se o código já existe antes de tentar novamente.");
        return;
      }
      form.reset();
      router.refresh();
      setMessage("Plano inativo cadastrado. Nenhuma cobrança ou licença foi ativada.");
    } catch {
      setMessage("Conexão indisponível. Consulte o cadastro antes de repetir a operação.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  if (!canWrite) return <p>Somente administradores da FM com permissão financeira podem registrar preços.</p>;
  return <form className="product-create-form" onSubmit={event => { void submit(event); }}>
    <label>Código exclusivo do plano
      <input name="planCode" required maxLength={64} autoCapitalize="characters" autoComplete="off" disabled={busy}/>
    </label>
    <label>Nome comercial
      <input name="name" required maxLength={120} disabled={busy}/>
    </label>
    <label>Periodicidade
      <select name="interval" defaultValue="" required disabled={busy}>
        <option value="" disabled>Selecione</option>
        <option value="monthly">Mensal</option><option value="yearly">Anual</option>
      </select>
    </label>
    <label>Preço (R$)
      <input name="amount" inputMode="decimal" placeholder="0,00" required disabled={busy}/>
      <small>Digite reais e centavos, sem separador de milhar.</small>
    </label>
    <label>Confirmação administrativa
      <input type="password" autoComplete="current-password" required
        value={password} onChange={event => setPassword(event.target.value)} disabled={busy}/>
    </label>
    <button type="submit" className="button" disabled={busy}>
      {busy ? "Registrando..." : "Cadastrar plano inativo"}
    </button>
    <p>Esta operação não gera faturas, publica direitos, altera quotas nem ativa assinaturas.</p>
    {message ? <p role="status">{message}</p> : null}
  </form>;
}
