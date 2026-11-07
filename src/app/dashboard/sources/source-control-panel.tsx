"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { SaasAdapterProfile } from "@/application/integration/saas-adapter-profiles";
import type { CommercialCoverageReport } from "@/application/integration/commercial-source-coverage";
import type { NfcoreCognitiveCoverageReport } from "@/application/integration/nfcore-cognitive-coverage";
import type { OperationalUsageCoverageReport } from "@/application/integration/operational-usage-coverage";

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
  runtimeOrigin?: string;
  originOverrideInvalid?: boolean;
  lastAttemptAt?: string;
  lastAttemptStatus?: string;
  lastSuccessfulSyncAt?: string;
};

type Props = {
  products: ProductOption[];
  sources: SourceView[];
  canWrite: boolean;
  supportedAdapters: readonly SaasAdapterProfile[];
};

type SourceState = {
  health?: string;
  sync?: string;
  coverage?: CommercialCoverageReport;
  coverageError?: string;
  cognitiveCoverage?: NfcoreCognitiveCoverageReport;
  cognitiveCoverageError?: string;
  usageCoverage?: OperationalUsageCoverageReport;
  usageCoverageError?: string;
};

function rotuloSaude(status: string) {
  if (status === "healthy") return "Saudável";
  if (status === "degraded") return "Degradada";
  if (status === "unavailable") return "Indisponível";
  if (status === "configured") return "Configurada — ainda não testada";
  return "Desconhecida";
}

function rotuloSync(status?: string) {
  if (status === "completed") return "Concluída";
  if (status === "running") return "Em andamento";
  if (status === "failed") return "Falhou";
  return "Nunca executada";
}

function dataHora(value?: string) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function mensagemErro(codigo?: string) {
  const conhecido: Record<string, string> = {
    "integration.source_definition_invalid": "A definição da fonte é inválida.",
    "integration.product_scope_invalid": "O produto selecionado não é válido ou não está ativo.",
    "integration.product_source_binding_invalid": "A integração não corresponde ao produto ou à credencial configurada.",
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

export function SourceControlPanel({ products, sources, canWrite, supportedAdapters }: Props) {
  const router = useRouter();
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedSourceType, setSelectedSourceType] = useState("");
  const selectedProduct = products.find((product) => product.id === selectedProductId);
  // A product can have more than one adapter profile registered (e.g. NFCore
  // has an independent cognitive profile and an independent commercial
  // profile). Never assume a single adapter per product here.
  const profilesForSelectedProduct = supportedAdapters.filter(
    profile => profile.productSlug === selectedProduct?.slug
  );
  const selection = selectedSourceType
    ? profilesForSelectedProduct.find(profile => profile.sourceType === selectedSourceType)
    : profilesForSelectedProduct.length === 1
      ? profilesForSelectedProduct[0]
      : undefined;
  const alreadyRegistered = sources.some((source) =>
    source.productId === selectedProductId && source.sourceType === selection?.sourceType
  );

  function selectProduct(productId: string) {
    setSelectedProductId(productId);
    setSelectedSourceType("");
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, SourceState>>({});

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const productId = String(form.get("productId") ?? "").trim();
    const sourceType = String(form.get("sourceType") ?? "").trim();
    const baseUrl = String(form.get("baseUrl") ?? "").trim();
    const freshnessSeconds = Number(form.get("freshnessSeconds") ?? "300");

    const product = products.find((item) => item.id === productId);
    const candidateProfiles = supportedAdapters.filter(profile => profile.productSlug === product?.slug);
    const config = sourceType
      ? candidateProfiles.find(profile => profile.sourceType === sourceType)
      : candidateProfiles.length === 1
        ? candidateProfiles[0]
        : undefined;
    if (!config || !baseUrl || sources.some((item) =>
      item.productId === productId && item.sourceType === config.sourceType
    )) {
      setMessage("Selecione uma integração suportada e ainda não cadastrada.");
      return;
    }
    setBusy("register");
    setMessage(null);
    try {
      const response = await fetch("/api/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId,
          name: config.name,
          sourceType: config.sourceType,
          authoritativeDomain: config.authoritativeDomain,
          syncMode: config.syncMode,
          secretRef: config.secretRef,
          mappingVersion: config.mappingVersion,
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
      setSelectedProductId("");
      setSelectedSourceType("");
      setMessage(`Fonte ${product?.name ?? "comercial"} cadastrada. Teste a conexão antes de sincronizar.`);
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
      router.refresh();
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

  function closeCoverage(sourceId: string, kind: "commercial" | "cognitive" | "operational") {
    setStates(current => ({
      ...current,
      [sourceId]: kind === "commercial"
        ? { ...current[sourceId], coverage: undefined, coverageError: undefined }
        : kind === "cognitive"
          ? { ...current[sourceId], cognitiveCoverage: undefined, cognitiveCoverageError: undefined }
          : { ...current[sourceId], usageCoverage: undefined, usageCoverageError: undefined },
    }));
  }

  async function commercialCoverage(sourceId: string) {
    setBusy(`coverage:${sourceId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/sources/${sourceId}/coverage`, {
        cache: "no-store",
      });
      const body = await json(response);
      if (!response.ok) {
        setStates(current => ({
          ...current,
          [sourceId]: {
            ...current[sourceId],
            coverage: undefined,
            coverageError: "Não foi possível consultar a cobertura comercial agora.",
          },
        }));
        return;
      }
      const coverage = body.coverage as CommercialCoverageReport | undefined;
      if (!coverage || !Array.isArray(coverage.collections) ||
          !Number.isSafeInteger(coverage.snapshotFactCount)) {
        throw new Error("integration.coverage_response_invalid");
      }
      setStates(current => ({
        ...current,
        [sourceId]: { ...current[sourceId], coverage, coverageError: undefined },
      }));
    } catch {
      setStates(current => ({
        ...current,
        [sourceId]: {
          ...current[sourceId],
          coverage: undefined,
          coverageError: "Falha ao consultar cobertura. Verifique a conexão autenticada.",
        },
      }));
    } finally {
      setBusy(null);
    }
  }

  async function cognitiveCoverage(sourceId: string) {
    setBusy(`cognitive-coverage:${sourceId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/sources/${sourceId}/cognitive-coverage`, {
        cache: "no-store",
      });
      const body = await json(response);
      if (!response.ok) {
        setStates(current => ({
          ...current,
          [sourceId]: {
            ...current[sourceId],
            cognitiveCoverage: undefined,
            cognitiveCoverageError: "Não foi possível consultar o NFCore. Verifique a conexão autenticada, o token de serviço e o endpoint cognitivo.",
          },
        }));
        return;
      }
      const coverage = body.coverage as NfcoreCognitiveCoverageReport | undefined;
      if (!coverage || coverage.source !== "nfcore-cognitive-metrics-v1" ||
          !Array.isArray(coverage.metrics) || typeof coverage.aiEnabled !== "boolean") {
        throw new Error("integration.nfcore_cognitive_coverage_invalid");
      }
      setStates(current => ({
        ...current,
        [sourceId]: { ...current[sourceId], cognitiveCoverage: coverage, cognitiveCoverageError: undefined },
      }));
    } catch {
      setStates(current => ({
        ...current,
        [sourceId]: {
          ...current[sourceId],
          cognitiveCoverage: undefined,
          cognitiveCoverageError: "Falha de consulta cognitiva. Não há métricas confirmadas; verifique a conexão do NFCore.",
        },
      }));
    } finally {
      setBusy(null);
    }
  }

  function operationalAdapter(source: SourceView): SourceView | undefined {
    const product = products.find(item => item.id === source.productId);
    const sourceType = product?.slug === "iron"
      ? "iron-usage-v1"
      : product?.slug === "nfcore"
        ? "nfcore-operational-usage-v1" : null;
    return sourceType
      ? sources.find(item => item.productId === source.productId && item.sourceType === sourceType)
      : undefined;
  }
  function supportsOperationalUsage(source: SourceView): boolean {
    const product = products.find(item => item.id === source.productId);
    return product?.slug === "iron" || product?.slug === "nfcore";
  }

  async function loadOperationalUsage(sourceId: string, usageSourceId?: string) {
    setStates(current => ({
      ...current, [sourceId]: {
        ...current[sourceId], usageCoverage: undefined, usageCoverageError: undefined,
      },
    }));
    if (!usageSourceId) {
      setStates(current => ({
        ...current, [sourceId]: {
          ...current[sourceId],
          usageCoverageError: "Fonte de consumo operacional não cadastrada. Registre o adaptador operacional deste produto antes da consulta.",
        },
      }));
      return;
    }
    setBusy(`usage:${sourceId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/sources/${usageSourceId}/usage`, { cache: "no-store" });
      const body = await json(response);
      if (!response.ok) throw new Error("operational_usage.query_failed");
      const coverage = body.coverage as OperationalUsageCoverageReport | undefined;
      if (!coverage || !Array.isArray(coverage.summary) ||
          !Array.isArray(coverage.groups) ||
          !["iron-usage-v1", "nfcore-operational-usage-v1"].includes(coverage.source) ||
          !["execution_count", "quota_usage"].includes(coverage.measurementKind)) {
        throw new Error("operational_usage.response_invalid");
      }
      setStates(current => ({
        ...current,[sourceId]: {
          ...current[sourceId],usageCoverage: coverage,usageCoverageError:undefined,
        },
      }));
    } catch {
      setStates(current => ({
        ...current,[sourceId]: {
          ...current[sourceId], usageCoverage:undefined,
          usageCoverageError:"Consumo operacional indisponível. Verifique credencial, origem HTTPS e contrato do produto.",
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
      const processed = typeof body.ingested === "number" ? body.ingested : null;
      const inserted = typeof body.inserted === "number" ? body.inserted : null;
      const label = status === "duplicate"
        ? "Sincronização já processada para esta chave."
        : status === "in_progress"
          ? "Sincronização já está em andamento."
          : `Sincronização concluída: ${processed ?? "não informado"} fato(s) processado(s).` +
            (inserted === null ? " Novos registros no banco: não verificados."
              : ` Novos registros gravados: ${inserted}.`) +
            " Essa contagem não corresponde ao número de funcionalidades integradas.";
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
              <h2 id="source-register-title">{selection?.title ?? "Conectar produto"}</h2>
            </div>
            <p>
              O navegador grava somente URL e referência do segredo. O valor real
              do segredo permanece exclusivamente no runtime do servidor.
            </p>
          </div>

          {products.length === 0 ? (
            <div className="empty-state">
              <strong>Nenhum produto ativo disponível.</strong>
              <p>Cadastre primeiro um produto no dashboard.</p>
            </div>
          ) : (
            <form className="product-create-form" onSubmit={register}>
              <label>
                Produto
                <select name="productId" required value={selectedProductId} onChange={(event) => selectProduct(event.target.value)}>
                  <option value="" disabled>Selecione o produto</option>
                  {products.filter((product) => supportedAdapters.some(profile => profile.productSlug === product.slug)).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.slug})
                    </option>
                  ))}
                </select>
              </label>
              {profilesForSelectedProduct.length > 1 ? (
                <label>
                  Integração
                  <select
                    name="sourceType"
                    required
                    value={selectedSourceType}
                    onChange={(event) => setSelectedSourceType(event.target.value)}
                  >
                    <option value="" disabled>Selecione a integração</option>
                    {profilesForSelectedProduct.map((profile) => {
                      const registered = sources.some((source) =>
                        source.productId === selectedProductId && source.sourceType === profile.sourceType
                      );
                      return (
                        <option key={profile.sourceType} value={profile.sourceType} disabled={registered}>
                          {profile.title} — {profile.authoritativeDomain === "commercial" ? "Comercial" : "Cognitiva"}
                          {registered ? " (já cadastrada)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>
              ) : (
                <input type="hidden" name="sourceType" value={selectedSourceType || (selection?.sourceType ?? "")} />
              )}
              <label>
                {selection?.urlLabel ?? "URL HTTPS do produto"}
                <input
                  name="baseUrl"
                  type="url"
                  required
                  pattern="https://.*"
                  placeholder={selection?.placeholder ?? "Selecione um produto suportado"}
                  autoComplete="off"
                  disabled={!selection || alreadyRegistered}
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
              {alreadyRegistered ? <p role="status">Esta fonte já está registrada. Use a seção de saúde e sincronização abaixo.</p> : null}
              <button className="button" type="submit" disabled={busy === "register" || !selection || alreadyRegistered}>
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
                <small>Saúde persistida: <b className="status-value">{rotuloSaude(source.status)}</b></small>
                <small>Último sync bem-sucedido: <b className="status-value">{dataHora(source.lastSuccessfulSyncAt)}</b></small>
                <small>
                  Última tentativa: <b className="status-value">{dataHora(source.lastAttemptAt)} · {rotuloSync(source.lastAttemptStatus)}</b>
                </small>
                {source.baseUrl ? <small>Origem cadastrada: {source.baseUrl}</small> : null}
                  {source.runtimeOrigin ? <small>Origem em uso (sem alterar o banco): {source.runtimeOrigin}</small> : null}
                  {source.originOverrideInvalid ? <small role="alert">Configuração de origem em execução inválida — conexão bloqueada.</small> : null}
                <div>
                  <button
                    className="button"
                    type="button"
                    disabled={busy === `health:${source.id}`}
                    onClick={() => void health(source.id)}
                  >
                    {busy === `health:${source.id}` ? "Testando…" : "Testar conexão"}
                  </button>
                  {canWrite && source.authoritativeDomain !== "operational-usage" ? (
                    <button
                      className="button"
                      type="button"
                      disabled={busy === `sync:${source.id}`}
                      onClick={() => void sync(source.id)}
                    >
                      {busy === `sync:${source.id}` ? "Sincronizando…" : "Sincronizar agora"}
                    </button>
                  ) : null}
                  {canWrite && (
                    source.sourceType === "kordena-commercial-v1" ||
                    source.sourceType === "iron-commercial-v1" ||
                    source.sourceType === "nfcore-commercial-v1"
                  ) ? (
                    <button
                      className="button"
                      type="button"
                      disabled={busy === `coverage:${source.id}`}
                      onClick={() => void commercialCoverage(source.id)}
                    >
                      {busy === `coverage:${source.id}` ? "Consultando…" : "Ver cobertura comercial"}
                    </button>
                  ) : null}
                  {canWrite && supportsOperationalUsage(source) ? (
                    <button
                      className="button"
                      type="button"
                      disabled={busy === `usage:${source.id}`}
                      onClick={() => void loadOperationalUsage(source.id, operationalAdapter(source)?.id)}
                    >
                      {busy === `usage:${source.id}` ? "Consultando…" : "Ver consumo operacional"}
                    </button>
                  ) : null}
                  {canWrite && source.sourceType === "nfcore-cognitive-metrics-v1" ? (
                    <button
                      className="button"
                      type="button"
                      disabled={busy === `cognitive-coverage:${source.id}`}
                      onClick={() => void cognitiveCoverage(source.id)}
                    >
                      {busy === `cognitive-coverage:${source.id}` ? "Consultando…" : "Ver cobertura cognitiva"}
                    </button>
                  ) : null}
                </div>
                {source.authoritativeDomain === "operational-usage" ? (
                  <small>Consulta sob demanda, somente leitura. Nenhum dado é sincronizado para outra autoridade.</small>
                ) : null}
                {states[source.id]?.usageCoverageError ? (
                  <small role="alert">{states[source.id]?.usageCoverageError}</small>
                ) : null}
                {states[source.id]?.usageCoverage ? (
                  <div className="fmcc-source-coverage" role="region"
                    aria-label={`Consumo operacional de ${source.name}`}>
                    <div className="fmcc-source-coverage-heading">
                      <strong>Consumo operacional — leitura atual</strong>
                      <button type="button" className="fmcc-source-coverage-close"
                        aria-label={`Fechar consumo operacional de ${source.name}`}
                        onClick={() => closeCoverage(source.id, "operational")}>
                        Fechar ×
                      </button>
                    </div>
                    <small>Contrato: {states[source.id]?.usageCoverage?.contract}.</small>
                    <small>Autoridade: {states[source.id]?.usageCoverage?.authority}.
                      Retrato: {dataHora(states[source.id]?.usageCoverage?.asOf)}.
                      Consultado: {dataHora(states[source.id]?.usageCoverage?.queriedAt)}.</small>
                    {states[source.id]?.usageCoverage?.windowDays ? (
                      <small>Janela: {states[source.id]?.usageCoverage?.windowDays} dias, desde
                        {" "}{dataHora(states[source.id]?.usageCoverage?.windowStart ?? undefined)}.</small>
                    ) : null}
                    <ul className="fmcc-source-coverage-list">
                      {states[source.id]?.usageCoverage?.summary.map(item => (
                        <li key={item.code}>
                          <span>{item.label}</span>
                          <strong>{item.count.toLocaleString("pt-BR")}</strong>
                        </li>
                      ))}
                    </ul>
                    <details>
                      <summary>Ver medições agregadas</summary>
                      <ul className="fmcc-source-coverage-list">
                        {states[source.id]?.usageCoverage?.groups.map((item, index) => (
                          <li key={index}>
                            <span>{item.label}</span>
                            <strong>
                              {item.measured === null ? "Não informado"
                                : item.measured.toLocaleString("pt-BR")}
                              {item.limit !== null ? ` / limite ${item.limit.toLocaleString("pt-BR")}` : ""}
                              {item.missingMeasurements ? ` · ${item.missingMeasurements} sem medição` : ""}
                            </strong>
                          </li>
                        ))}
                      </ul>
                      {states[source.id]?.usageCoverage?.truncated ? (
                        <small>Lista parcial dos 40 primeiros grupos.</small>
                      ) : null}
                    </details>
                    <small>Valores ausentes permanecem indisponíveis, não zero.
                      Leitura sem identificação de tenants ou assinaturas individuais;
                      não certifica reconciliação externa.</small>
                  </div>
                ) : null}
                {states[source.id]?.cognitiveCoverageError ? (
                  <small role="alert">{states[source.id]?.cognitiveCoverageError}</small>
                ) : null}
                {states[source.id]?.cognitiveCoverage ? (
                  <div className="fmcc-source-coverage" role="region"
                    aria-label={`Cobertura cognitiva de ${source.name}`}>
                    <div className="fmcc-source-coverage-heading">
                      <strong>Cobertura cognitiva — leitura atual</strong>
                      <button type="button" className="fmcc-source-coverage-close"
                        aria-label={`Fechar cobertura cognitiva de ${source.name}`}
                        onClick={() => closeCoverage(source.id, "cognitive")}>
                        Fechar ×
                      </button>
                    </div>
                    <small>Consulta em {dataHora(states[source.id]?.cognitiveCoverage?.queriedAt)}.
                      Contrato: {states[source.id]?.cognitiveCoverage?.contract}.</small>
                    <small>IA externa habilitada: {states[source.id]?.cognitiveCoverage?.aiEnabled ? "Sim" : "Não"}.
                      Contadores por processo desde {dataHora(states[source.id]?.cognitiveCoverage?.since)}.</small>
                    <small>Último evento observado: {states[source.id]?.cognitiveCoverage?.lastObservedAt
                      ? dataHora(states[source.id]?.cognitiveCoverage?.lastObservedAt ?? undefined)
                      : "Nenhum evento informado"}.</small>
                    <ul className="fmcc-source-coverage-list">
                      {states[source.id]?.cognitiveCoverage?.metrics.map(metric => (
                        <li key={metric.code}>
                          <span>{metric.label}</span>
                          <strong>{metric.value === null ? "Não informado" : metric.value.toLocaleString("pt-BR")}</strong>
                        </li>
                      ))}
                    </ul>
                    <small>São contadores do processo atual; reinícios podem zerar o período.
                      Custos ausentes não significam custo zero. Não representam pagamentos, faturamento,
                      quotas duráveis nem certificação comercial E2E.</small>
                  </div>
                ) : null}
                {states[source.id]?.coverageError ? (
                  <small role="alert">{states[source.id]?.coverageError}</small>
                ) : null}
                {states[source.id]?.coverage ? (
                  <div className="fmcc-source-coverage" role="region"
                    aria-label={`Cobertura comercial de ${source.name}`}>
                    <div className="fmcc-source-coverage-heading">
                      <strong>Cobertura do contrato — leitura atual</strong>
                      <button type="button" className="fmcc-source-coverage-close"
                        aria-label={`Fechar cobertura comercial de ${source.name}`}
                        onClick={() => closeCoverage(source.id, "commercial")}>
                        Fechar ×
                      </button>
                    </div>
                    <small>Retrato de {dataHora(states[source.id]?.coverage?.asOf)}.
                      A quantidade de fatos não mede a completude comercial.</small>
                    <small>Fatos no snapshot: {states[source.id]?.coverage?.snapshotFactCount}.
                      Os conjuntos abaixo são lidos diretamente do SaaS, mas não são todos
                      armazenados como fatos pelo sincronizador.</small>
                    <ul className="fmcc-source-coverage-list">
                      {states[source.id]?.coverage?.collections.map(item => (
                        <li key={item.code}>
                          <span>{item.label}</span>
                          <strong>{item.authority === "fm-command"
                            ? "Autoridade: FM Command"
                            : `${item.reportedRecords} registro(s) reportado(s)`}</strong>
                        </li>
                      ))}
                    </ul>
                    {states[source.id]?.coverage?.summary.length ? (
                      <details>
                        <summary>Ver indicadores agregados do SaaS</summary>
                        <ul className="fmcc-source-coverage-list">
                          {states[source.id]?.coverage?.summary.map(item => (
                            <li key={item.code}><span>{item.label}</span><strong>{item.count}</strong></li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    <small>Telemetria adicional: {states[source.id]?.coverage?.additionalTelemetry === "reported"
                      ? "declarada no snapshot" : "não certificada nesta consulta"}.</small>
                    <small>Essa leitura comprova campos disponíveis no contrato; não certifica
                      reconciliação de pagamentos, execução de todas as funções nem integração E2E.</small>
                  </div>
                ) : null}
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
