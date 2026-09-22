import { CognitiveModelContractError, CognitiveModelUnavailableError, type CognitiveModel } from "@/domain/core/cognitive-model";
import type { CoreEvidence, CoreOperationalContext } from "@/domain/core/contracts";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

function parseJsonObject(content: string): { metricIds?: unknown } {
  const candidates = [content.trim()];
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) candidates.push(fenced);

  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(content.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as { metricIds?: unknown };
      }
    } catch {
      continue;
    }
  }

  throw new CognitiveModelContractError();
}

export class OpenAiCompatibleCognitiveModel implements CognitiveModel {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 30_000,
  ) {
    if (!/^https?:\/\//.test(baseUrl) || !apiKey.trim() || !model.trim()) {
      throw new CognitiveModelUnavailableError();
    }
  }

  async plan(input: {
    question: string;
    metricCatalog: readonly { metricId: string; displayName: string; description: string }[];
    operationalContext: readonly CoreOperationalContext[];
  }): Promise<{ metricIds: readonly string[] }> {
    const content = await this.complete([
      { role: "system", content: [
        "Você é o planejador do FM Control Center, um Core cognitivo vertical de gestão empresarial.",
        "Selecione SOMENTE metricIds presentes no catálogo fornecido.",
        "Escolha de 1 a 8 métricas necessárias para responder a pergunta.",
        "Para correlação, anomalia, risco ou recomendação use múltiplas métricas quando necessário.",
        "O contexto operacional serve apenas para continuidade e não é fonte factual.",
        'Responda somente JSON no formato {"metricIds":["..."]}.',
      ].join(" ") },
      { role: "user", content: JSON.stringify(input) },
    ], { jsonMode: true, maxTokens: 512 });

    try {
      const parsed = parseJsonObject(content);
      if (!Array.isArray(parsed.metricIds)) throw new Error("invalid");
      const allowed = new Set(input.metricCatalog.map((item) => item.metricId));
      const metricIds = [...new Set(
        parsed.metricIds.filter((item): item is string => typeof item === "string" && allowed.has(item)),
      )];
      if (metricIds.length < 1 || metricIds.length > 8) throw new Error("invalid");
      return { metricIds };
    } catch (error) {
      if (error instanceof CognitiveModelContractError) throw error;
      throw new CognitiveModelContractError();
    }
  }

  async synthesize(input: {
    question: string;
    facts: readonly Record<string, unknown>[];
    evidence: readonly CoreEvidence[];
    operationalContext: readonly CoreOperationalContext[];
  }): Promise<string> {
    const content = await this.complete([
      { role: "system", content: [
        "Você é o FMCC Cognitive Vertical Core.",
        "Responda como inteligência executiva do produto usando EXCLUSIVAMENTE facts/evidence governados.",
        "Pode explicar indicadores, correlacionar fatos, identificar padrões e anomalias, analisar riscos e recomendar próximos passos.",
        "Nunca invente números, nunca trate missing como zero, nunca some moedas sem política e nunca transforme recomendação em autorização.",
        "Contexto operacional é memória de continuidade, não fonte de verdade.",
      ].join(" ") },
      { role: "user", content: JSON.stringify(input) },
    ], { maxTokens: 1024 });

    if (!content.trim()) throw new CognitiveModelContractError();
    return content.trim();
  }

  private async complete(
    messages: readonly { role: "system" | "user"; content: string }[],
    options: { jsonMode?: boolean; maxTokens: number },
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(new URL("/v1/chat/completions", this.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_tokens: options.maxTokens,
          stream: false,
          messages,
          ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new CognitiveModelUnavailableError();

      const payload = await response.json() as ChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new CognitiveModelContractError();
      return content;
    } catch (error) {
      if (error instanceof CognitiveModelContractError || error instanceof CognitiveModelUnavailableError) throw error;
      throw new CognitiveModelUnavailableError();
    } finally {
      clearTimeout(timer);
    }
  }
}
