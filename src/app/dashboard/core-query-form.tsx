"use client";

import { FormEvent, useState } from "react";
import { rotuloAutoridadeFonte, rotuloMetrica } from "@/presentation/pt-br";

type State = {
  status: "idle" | "loading" | "success" | "error";
  answer?: string;
  evidence?: Array<{ ref: string; sourceAuthority?: string }>;
};

function cognitiveErrorMessage(code?: string): string {
  if (code === "core.cognitive_model_unavailable") {
    return "Provedor cognitivo indisponível. Verifique a configuração, a credencial ou a conectividade do modelo.";
  }
  if (code === "core.cognitive_model_contract_invalid") {
    return "O provedor respondeu, mas a resposta não passou pelo contrato cognitivo governado.";
  }
  return "Não foi possível consultar o Core.";
}

export function CoreQueryForm() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const question = String(form.get("question") ?? "").trim();
    if (!question) return;

    setState({ status: "loading" });

    try {
      const response = await fetch("/api/core/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const payload = await response.json() as {
        answer?: string;
        evidence?: Array<{ ref: string; sourceAuthority?: string }>;
        error?: string;
      };

      if (!response.ok) {
        setState({ status: "error", answer: cognitiveErrorMessage(payload.error) });
        return;
      }

      if (typeof payload.answer !== "string" || !payload.answer.trim()) {
        setState({ status: "error", answer: cognitiveErrorMessage() });
        return;
      }

      setState({ status: "success", answer: payload.answer, evidence: payload.evidence });
    } catch {
      setState({ status: "error", answer: cognitiveErrorMessage() });
    }
  }

  return (
    <section className="core-panel" aria-labelledby="core-title">
      <div>
        <span className="eyebrow">FM Cognitive Core</span>
        <h2 id="core-title">Consulta executiva governada</h2>
        <p>O Core usa as mesmas métricas determinísticas do painel e informa quando um dado não existe.</p>
      </div>

      <form onSubmit={submit} className="core-form">
        <label htmlFor="core-question">Pergunta</label>
        <div className="core-input-row">
          <input
            id="core-question"
            name="question"
            maxLength={4000}
            placeholder="Ex.: Quanto faturamos no período?"
            autoComplete="off"
          />
          <button type="submit" disabled={state.status === "loading"}>
            {state.status === "loading" ? "Consultando…" : "Consultar"}
          </button>
        </div>
      </form>

      {state.answer && (
        <div className={state.status === "error" ? "core-answer error" : "core-answer"} role="status">
          <strong>{state.status === "error" ? "Indisponível" : "Resposta"}</strong>
          <p>{state.answer}</p>
          {state.evidence?.length ? (
            <small>
              Proveniência: {state.evidence
                .map((item) => `${rotuloMetrica(item.ref)} · ${rotuloAutoridadeFonte(item.sourceAuthority)}`)
                .join(", ")}
            </small>
          ) : null}
        </div>
      )}
    </section>
  );
}
