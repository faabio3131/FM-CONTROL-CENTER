"use client";

import { useState } from "react";

const ACTIONS = [
  "plan_version.create",
  "plan_version.validate",
  "plan_version.publish",
  "price.create",
  "price.validate",
  "price.publish",
  "promotion.create",
  "promotion_version.create",
  "promotion_version.validate",
  "promotion_version.publish",
] as const;

export function KordenaCommercialAdminForm(props: { sourceId: string }) {
  const [action, setAction] = useState<(typeof ACTIONS)[number]>(
    "plan_version.create",
  );
  const [resourceId, setResourceId] = useState("KORDENA_PLAN_A");
  const [payload, setPayload] = useState(
    JSON.stringify(
      {
        display_name: "Plano A",
        description: "Nova versão comercial",
        trial_eligible: true,
        marketing_badge: null,
        metadata: {},
        entitlements: [],
        change_reason: "Alteração administrativa via FMCC",
      },
      null,
      2,
    ),
  );
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus(null);
    setBusy(true);
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      const response = await fetch(
        "/api/integrations/kordena-commercial/commands",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            sourceId: props.sourceId,
            password,
            action,
            resourceId: resourceId.trim() || undefined,
            payload: parsed,
          }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setStatus(body.error ?? `Falha HTTP ${response.status}`);
        return;
      }
      setStatus("Comando aceito pela autoridade comercial canônica.");
      setPassword("");
    } catch {
      setStatus("Payload JSON inválido ou falha ao enviar o comando.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <span className="eyebrow">Administração governada</span>
      <h2>Comando comercial Kordena</h2>
      <p>
        Toda mutação exige reautenticação por senha e é encaminhada para a
        Commercial Platform. O FMCC não escreve no banco do Kordena.
      </p>
      <label>
        Ação
        <select
          value={action}
          onChange={(event) =>
            setAction(event.target.value as (typeof ACTIONS)[number])
          }
        >
          {ACTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        Recurso
        <input
          value={resourceId}
          onChange={(event) => setResourceId(event.target.value)}
        />
      </label>
      <label>
        Payload canônico
        <textarea
          rows={14}
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
        />
      </label>
      <label>
        Confirme sua senha
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <button className="button primary" type="submit" disabled={busy}>
        {busy ? "Confirmando…" : "Reautenticar e enviar"}
      </button>
      {status ? <p role="status">{status}</p> : null}
    </form>
  );
}
