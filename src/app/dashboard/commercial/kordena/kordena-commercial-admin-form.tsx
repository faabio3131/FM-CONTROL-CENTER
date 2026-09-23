"use client";

import { useMemo, useState } from "react";

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

type Action = (typeof ACTIONS)[number];

function previewAction(action: Action) {
  if (action === "plan_version.publish") return "plan_version.preview";
  if (action === "price.publish") return "price.preview";
  if (action === "promotion_version.publish") {
    return "promotion_version.preview";
  }
  return null;
}

export function KordenaCommercialAdminForm(props: { sourceId: string }) {
  const [action, setAction] = useState<Action>("plan_version.create");
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
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requiredPreview = useMemo(() => previewAction(action), [action]);

  function invalidatePreview() {
    setPreview(null);
    setStatus(null);
  }

  async function send(
    selectedAction: string,
    selectedPayload: Record<string, unknown>,
  ) {
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
          action: selectedAction,
          resourceId: resourceId.trim() || undefined,
          payload: selectedPayload,
        }),
      },
    );
    const body = (await response.json()) as Record<string, unknown> & {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(body.error ?? `Falha HTTP ${response.status}`);
    }
    return body;
  }

  async function showPreview() {
    if (!requiredPreview) return;
    setBusy(true);
    setStatus(null);
    try {
      const body = await send(requiredPreview, {});
      setPreview(JSON.stringify(body.result ?? body, null, 2));
      setStatus("Diff canônico carregado. Revise antes de confirmar.");
    } catch (error) {
      setPreview(null);
      setStatus(error instanceof Error ? error.message : "Falha no preview.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (requiredPreview && !preview) {
      setStatus("Visualize o diff canônico antes de confirmar a publicação.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      await send(action, parsed);
      setStatus("Comando aceito pela autoridade comercial canônica.");
      setPassword("");
      setPreview(null);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Payload JSON inválido ou falha ao enviar o comando.",
      );
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
        Commercial Platform. Publicações exigem preview/diff canônico antes da
        confirmação.
      </p>
      <label>
        Ação
        <select
          value={action}
          onChange={(event) => {
            setAction(event.target.value as Action);
            invalidatePreview();
          }}
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
          onChange={(event) => {
            setResourceId(event.target.value);
            invalidatePreview();
          }}
        />
      </label>
      <label>
        Payload canônico
        <textarea
          rows={14}
          value={payload}
          onChange={(event) => {
            setPayload(event.target.value);
            invalidatePreview();
          }}
        />
      </label>
      <label>
        Confirme sua senha
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            invalidatePreview();
          }}
          required
        />
      </label>
      {requiredPreview ? (
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={() => void showPreview()}
        >
          {busy ? "Carregando…" : "Visualizar diff antes de publicar"}
        </button>
      ) : null}
      {preview ? (
        <pre className="card" aria-label="Diff canônico">
          {preview}
        </pre>
      ) : null}
      <button
        className="button primary"
        type="submit"
        disabled={busy || Boolean(requiredPreview && !preview)}
      >
        {busy ? "Confirmando…" : "Reautenticar e confirmar"}
      </button>
      {status ? <p role="status">{status}</p> : null}
    </form>
  );
}
