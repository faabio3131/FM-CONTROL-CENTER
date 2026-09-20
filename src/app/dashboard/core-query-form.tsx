"use client";

import { FormEvent, useState } from "react";

type State = { status: "idle" | "loading" | "success" | "error"; answer?: string; evidence?: Array<{ ref: string; sourceAuthority?: string }> };

export function CoreQueryForm() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const question = String(form.get("question") ?? "").trim();
    if (!question) return;
    setState({ status: "loading" });
    const response = await fetch("/api/core/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
    const payload = await response.json() as { answer?: string; evidence?: Array<{ ref: string; sourceAuthority?: string }>; error?: string };
    if (!response.ok) {
      setState({ status: "error", answer: payload.error === "core.canonical_service_unavailable" ? "Core canônico ainda não está conectado neste ambiente. O dashboard determinístico continua disponível." : "Não foi possível consultar o Core." });
      return;
    }
    setState({ status: "success", answer: payload.answer, evidence: payload.evidence });
  }

  return (
    <section className="core-panel" aria-labelledby="core-title">
      <div>
        <span className="eyebrow">FM Cognitive Core</span>
        <h2 id="core-title">Consulta executiva governada</h2>
        <p>O Core usa as mesmas métricas determinísticas do dashboard e informa quando um dado não existe.</p>
      </div>
      <form onSubmit={submit} className="core-form">
        <label htmlFor="core-question">Pergunta</label>
        <div className="core-input-row">
          <input id="core-question" name="question" maxLength={4000} placeholder="Ex.: Quanto faturamos no período?" autoComplete="off" />
          <button type="submit" disabled={state.status === "loading"}>{state.status === "loading" ? "Consultando…" : "Consultar"}</button>
        </div>
      </form>
      {state.answer && <div className={state.status === "error" ? "core-answer error" : "core-answer"} role="status">
        <strong>{state.status === "error" ? "Indisponível" : "Resposta"}</strong>
        <p>{state.answer}</p>
        {state.evidence?.length ? <small>Proveniência: {state.evidence.map((item) => item.sourceAuthority ? `${item.ref} · ${item.sourceAuthority}` : item.ref).join(", ")}</small> : null}
      </div>}
    </section>
  );
}
