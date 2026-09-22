import { afterEach, describe, expect, it, vi } from "vitest";
import { CognitiveModelContractError } from "@/domain/core/cognitive-model";
import { OpenAiCompatibleCognitiveModel } from "@/infrastructure/core/openai-compatible-cognitive-model";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FMCC cognitive model adapter", () => {
  it("aceita apenas metricIds presentes no catálogo governado", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        metricIds: ["billing.gross_billed", "metric.forbidden"],
      }) } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new OpenAiCompatibleCognitiveModel(
      "https://models.example.test",
      "unit-test-token",
      "approved-model",
    );

    const result = await adapter.plan({
      question: "Quanto faturamos?",
      metricCatalog: [{
        metricId: "billing.gross_billed",
        displayName: "Faturamento",
        description: "Faturamento governado",
      }],
      operationalContext: [],
    });

    expect(result.metricIds).toEqual(["billing.gross_billed"]);
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      max_tokens?: number;
      response_format?: { type?: string };
    };
    expect(request.max_tokens).toBe(512);
    expect(request.response_format).toEqual({ type: "json_object" });
  });

  it("tolera envelope textual ao redor do JSON sem ampliar o catálogo permitido", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'analysis marker\n```json\n{"metricIds":["billing.gross_billed","metric.forbidden"]}\n```' } }],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const adapter = new OpenAiCompatibleCognitiveModel(
      "https://models.example.test",
      "unit-test-token",
      "approved-model",
    );

    await expect(adapter.plan({
      question: "Quanto faturamos?",
      metricCatalog: [{
        metricId: "billing.gross_billed",
        displayName: "Faturamento",
        description: "Faturamento governado",
      }],
      operationalContext: [],
    })).resolves.toEqual({ metricIds: ["billing.gross_billed"] });
  });

  it("falha fechado quando o modelo não retorna nenhuma métrica autorizada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ metricIds: ["metric.forbidden"] }) } }],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const adapter = new OpenAiCompatibleCognitiveModel(
      "https://models.example.test",
      "unit-test-token",
      "approved-model",
    );

    await expect(adapter.plan({
      question: "Solicite uma métrica fora do catálogo",
      metricCatalog: [{
        metricId: "trial.starts.count",
        displayName: "Trials",
        description: "Trials iniciados",
      }],
      operationalContext: [],
    })).rejects.toBeInstanceOf(CognitiveModelContractError);
  });

  it("preserva síntese como texto sem permitir que o provider substitua evidence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "A métrica governada indica 10 trials." } }],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const adapter = new OpenAiCompatibleCognitiveModel(
      "https://models.example.test",
      "unit-test-token",
      "approved-model",
    );

    await expect(adapter.synthesize({
      question: "Quantos trials?",
      facts: [{ metricId: "trial.starts.count", value: "10" }],
      evidence: [{ kind: "metric", ref: "trial.starts.count" }],
      operationalContext: [],
    })).resolves.toBe("A métrica governada indica 10 trials.");
  });
});
