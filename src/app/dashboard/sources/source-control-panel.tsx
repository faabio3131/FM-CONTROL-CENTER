"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type ProductOption = {
  id: string;
  name: string;
  slug: string;
};

type SourceView = {
  id: string;
  productId?: string;
  name: string;
  sourceType: string;
  authoritativeDomain: string;
  status: string;
  syncMode: string;
  freshnessSeconds?: number;
  hasSecretReference: boolean;
  baseUrl?: string;
};

type Props = {
  products: ProductOption[];
  sources: SourceView[];
  canWrite: boolean;
};

type SourceState = {
  health?: string;
  sync?: string;
};

function rotuloSaude(status: string) {
  if (status === "healthy") return "Saudável";
  if (status === "degraded") return "Degradada";
  if (status === "unavailable") return "Indisponível";
  return "Desconhecida";
}

function mensagemErro(codigo?: string) {
  const conhecido: Record<string, string> = {
    "integration.source_definition_invalid": "A definição da fonte é inválida.",
    "integration.product_scope_invalid": "O produto selecionado não é válido ou não está ativo.",
    "integration.secret_reference_invalid": "A referência de segredo da fonte é inválida.",
    "integration.sync_failed": "A sincronização falhou ou a configuração externa ainda não está pronta.",
    "integration.health_failed": "Não foi possível consultar a saúde da integração.",
    "security.permission_denied:source:write": "Seu papel não pode cadastrar fontes.",
    "security.permission_denied:integration:write": "Seu papel não pode sincronizar fontes.",
  };
  return conhecido[codigo ?? ""] ?? "A operação não pôde ser concluída.";
}

async function json(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function SourceControlPanel({ products, sources, canWrite }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, SourceState>>({});

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const productId = String(form.get("productId") ?? "").trim();
    const baseUrl = String(form.get("baseUrl") ?? "").trim();
    const freshnessSeconds = Number(form.get("freshnessSeconds") ?? "300");

    if (!productId || !baseUrl) return;
    setBusy("register");
    setMessage(null);
    try {
      const response = await fetch("/api/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId,
          name: "Kordena Comercial",
          sourceType: "kordena-commercial-v1",
          authoritativeDomain: "commercial",
          syncMode: "pull",
          secretRef: "env:FMCC_KORDENA_CONTROL_PLANE_TOKEN",
          mappingVersion: "kordena-commercial-v1",
          freshnessSeconds,
          config: { baseUrl },
        }),
      });
      const body = await json(response);
      if (!response.ok) {
        setMessage(mensagemErro(typeof body.error === "string" ? body.error : undefined));
        return;
      }
      formElement.reset();
      setMessage("Fonte Kordena cadastrada. Agora teste a conexão antes de sincronizar.");
      router.refresh();
    } catch {
      setMessage("Não foi possível cadastrar a fonte.");
    } finally {
      setBusy(null);
    }
  }

  async function health(sourceId: string) {
    setBusy(`health:${sourceId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/sources/${sourceId}/health`, {
        cache: "no-store",
      });
      const body = await json(response);
      if (!response.ok) {
        const error = typeof body.error === "string" ? body.error : undefined;
        setStates((current) => ({
          ...current,
          [sourceId]: { ...current[sourceId], health: mensagemErro(error) },
        }));
        return;
      }
      const status = typeof body.status === "string" ? body.status : "unknown";
      setStates((current) => ({
        ...current,
        [sourceId]: {
          ...current[sourceId],
          health: `Saúde: ${rotuloSaude(status)}`,
        },
      }));
    } catch {
      setStates((current) => ({
        ...current,
        [sourceId]: {
          ...current[sourceId],
          health: "Saúde: não foi possível consultar.",
        },
      }));
    } finally {
      setBusy(null);
    }
  }

  async function sync(sourceId: string) {
    setBusy(`sync:${sourceId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/sources/${sourceId}/sync`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({}),
      });
      const body = await json(response);
      if (!response.ok) {
        const error = typeof body.error === "string" ? body.error : undefined;
        setStates((current) => ({
          ...current,
          [sourceId]: { ...current[sourceId], sync: mensagemErro(error) },
        }));
        return;
      }
      const status = typeof body.status === "string" ? body.status : "completed";
      const ingested = typeof body.ingested === "number" ? body.ingested : 0;
      const label = status === "duplicate"
        ? "Sincronização já processada para esta chave."
        : status === "in_progress"
          ? "Sincronização já está em andamento."
          : `Sincronização concluída: ${ingested} fato(s) canônico(s) ingerido(s).`;
      setStates((current) => ({
        ...current,
        [sourceId]: { ...current[sourceId], sync: label },
      }));
      router.refresh();
    } catch {
      setStates((current) => ({
        ...current,
        [sourceId]: {
          ...current[sourceId],
          sync: "A sincronização não pôde ser concluída.",
        },
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {canWrite ? (
        <section className="executive-section" aria-labelledby="source-register-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Cadastro governado</span>
              <h2 id="source-register-title">Conectar Kordena</h2>
            </div>
            <p>
              O navegador grava somente URL e referência do segredo. O valor real
              do segredo permanece exclusivamente no runtime do servidor.
            </p>
          </div>

          {products.length === 0 ? (
            <div className="empty-state">
              <strong>Nenhum produto ativo disponível.</strong>
              <p>Cadastre primeiro o produto Kordena no dashboard.</p>
            </div>
          ) : (
            <form className="product-create-form" onSubmit={register}>
              <label>
                Produto
                <select name="productId" required defaultValue="">
                  <option value="" disabled>Selecione o produto</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.slug})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                URL HTTPS do Kordena
                <input
                  name="baseUrl"
                  type="url"
                  required
                  pattern="https://.*"
                  placeholder="https://seu-kordena.exemplo.com"
                  autoComplete="off"
                />
              </label>
              <label>
                Atualidade esperada (segundos)
                <input
                  name="freshnessSeconds"
                  type="number"
                  min={30}
                  max={86400}
                  defaultValue={300}
                  required
                />
              </label>
              <button className="button" type="submit" disabled={busy === "register"}>
                {busy === "register" ? "Cadastrando…" : "Cadastrar fonte"}
              </button>
            </form>
          )}
          {message ? <p role="status">{message}</p> : null}
        </section>
      ) : null}

      <section className="executive-section" aria-labelledby="source-list-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Fontes registradas</span>
            <h2 id="source-list-title">Saúde e sincronização</h2>
          </div>
          <p>
            Uma fonte cadastrada não é considerada conectada até que saúde,
            autenticação e ingestão real sejam comprovadas.
          </p>
        </div>

        {sources.length === 0 ? (
          <div className="empty-state">
            <strong>Nenhuma fonte configurada.</strong>
            <p>O FMCC permanecerá exibindo dados ausentes como indisponíveis.</p>
          </div>
        ) : (
          <div className="product-grid">
            {sources.map((source) => (
              <article className="product-card" key={source.id}>
                <span className="eyebrow">{source.authoritativeDomain}</span>
                <strong>{source.name}</strong>
                <small>Tipo técnico: {source.sourceType}</small>
                <small>Modo: {source.syncMode === "pull" ? "Consulta periódica" : source.syncMode}</small>
                <small>Referência de segredo: {source.hasSecretReference ? "Configurada por referência" : "Ausente"}</small>
                {source.baseUrl ? <small>Origem: {source.baseUrl}</small> : null}
                <div>
                  <button
                    className="button"
                    type="button"
                    disabled={busy === `health:${source.id}`}
                    onClick={() => void health(source.id)}
                  >
                    {busy === `health:${source.id}` ? "Testando…" : "Testar conexão"}
                  </button>
                  {canWrite ? (
                    <button
                      className="button"
                      type="button"
                      disabled={busy === `sync:${source.id}`}
                      onClick={() => void sync(source.id)}
                    >
                      {busy === `sync:${source.id}` ? "Sincronizando…" : "Sincronizar agora"}
                    </button>
                  ) : null}
                </div>
                {states[source.id]?.health ? <small role="status">{states[source.id]?.health}</small> : null}
                {states[source.id]?.sync ? <small role="status">{states[source.id]?.sync}</small> : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
