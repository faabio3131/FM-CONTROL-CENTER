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

const ACTION_LABELS: Record<Action, string> = {
  "plan_version.create": "Criar versão de plano",
  "plan_version.validate": "Validar versão de plano",
  "plan_version.publish": "Publicar versão de plano",
  "price.create": "Criar preço",
  "price.validate": "Validar preço",
  "price.publish": "Publicar preço",
  "promotion.create": "Criar promoção",
  "promotion_version.create": "Criar versão de promoção",
  "promotion_version.validate": "Validar versão de promoção",
  "promotion_version.publish": "Publicar versão de promoção",
};

function previewAction(action: Action) {
  if (action === "plan_version.publish") return "plan_version.preview";
  if (action === "price.publish") return "price.preview";
  if (action === "promotion_version.publish") {
    return "promotion_version.preview";
  }
  return null;
}

function mensagemFalha(codigo: string, statusHttp?: number) {
  const conhecido: Record<string, string> = {
    "security.step_up_required": "A reautenticação por senha é obrigatória.",
    "security.permission_denied:commercial:write": "Seu papel não possui permissão para alteração comercial.",
    "commercial.approval_required": "Visualize e aprove a prévia antes de publicar.",
    "commercial.approval_invalid": "A aprovação da publicação não é válida.",
    "commercial.approval_expired": "A aprovação expirou. Gere uma nova prévia.",
    "commercial.approval_already_used": "Essa aprovação já foi utilizada. Gere uma nova prévia.",
    "commercial.approval_context_required": "A prévia precisa estar vinculada aos dados que serão publicados.",
    "integration.kordena_command_failed": "O Kordena não conseguiu processar o comando comercial.",
  };
  const mensagem = conhecido[codigo] ?? "A operação comercial foi recusada.";
  return statusHttp
    ? `${mensagem} Código técnico: ${codigo} · HTTP ${statusHttp}.`
    : `${mensagem} Código técnico: ${codigo}.`;
}

export function KordenaCommercialAdminForm(props: {
  sourceId: string;
  catalog: readonly Record<string, unknown>[];
}) {
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
  const [planVersionId, setPlanVersionId] = useState("");
  const [planCode, setPlanCode] = useState("KORDENA_PLAN_A");
  const [planDisplayName, setPlanDisplayName] = useState("");
  const [entitlementKey, setEntitlementKey] = useState("");
  const [entitlementLimit, setEntitlementLimit] = useState("");
  const [entitlementUnit, setEntitlementUnit] = useState("credits");
  const [priceAmount, setPriceAmount] = useState("");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [priceChangePolicy, setPriceChangePolicy] = useState(
    "new_customers_only",
  );
  const [priceReason, setPriceReason] = useState(
    "Novo preço de assinatura definido pela FM Tecnologia",
  );
  const effectivePlanVersions = useMemo(
    () => props.catalog.flatMap((raw) => {
      const version = raw.effective_version;
      if (!version || typeof version !== "object" || Array.isArray(version))
        return [];
      const record = version as Record<string, unknown>;
      if (typeof record.plan_version_id !== "string") return [];
      return [{
        id: record.plan_version_id,
        name: String(record.display_name ?? raw.plan_code ?? "Plano"),
        code: String(raw.plan_code ?? ""),
      }];
    }), [props.catalog],
  );
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [approvalToken, setApprovalToken] = useState<string | null>(null);
  const [approvalExpiresAt, setApprovalExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requiredPreview = useMemo(() => previewAction(action), [action]);

  /** Preserva capacidades anteriores ao criar nova versão de plano. */
  function prepararPlano() {
    const code = planCode.trim();
    const name = planDisplayName.trim();
    const key = entitlementKey.trim().toLowerCase();
    const quantidade = entitlementLimit.trim().replace(",", ".");
    const unit = entitlementUnit.trim();
    if (!/^KORDENA_PLAN_[A-D]$/.test(code) || !name || name.length > 128) {
      setStatus("Selecione um dos quatro planos e informe um nome válido.");
      return;
    }
    if (!/^[a-z0-9_.-]+$/.test(key) || key.length > 128 ||
        !/^\\d+(?:\\.\\d+)?$/.test(quantidade) || Number(quantidade) <= 0 ||
        !/^[a-zA-Z0-9_.-]+$/.test(unit) || unit.length > 32) {
      setStatus("Informe a capacidade, limite positivo e unidade do limite.");
      return;
    }
    const current = props.catalog.find((row) => row.plan_code === code);
    const effective = current?.effective_version;
    const record = effective && typeof effective === "object" && !Array.isArray(effective)
      ? effective as Record<string, unknown>
      : null;
    const previous = Array.isArray(record?.entitlements)
      ? record.entitlements.filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === "object" && !Array.isArray(item),
        ) : [];
    const preserved = previous.filter((item) => item.capability_key !== key);
    const existing = previous.find((item) => item.capability_key === key);
    const existingConfig = existing?.config && typeof existing.config === "object" &&
      !Array.isArray(existing.config) ? existing.config : {};
    setAction("plan_version.create");
    setResourceId(code);
    setPayload(JSON.stringify({
      display_name: name,
      description: typeof record?.description === "string" ? record.description : null,
      trial_eligible: typeof record?.trial_eligible === "boolean" ? record.trial_eligible : true,
      marketing_badge: typeof record?.marketing_badge === "string" ? record.marketing_badge : null,
      metadata: {},
      entitlements: [...preserved, {
        capability_key: key,
        enabled: true,
        limit_value: quantidade,
        limit_unit: unit,
        config: existingConfig,
      }],
      change_reason: "Atualizar franquias do plano com preservação das capacidades anteriores",
    }, null, 2));
    invalidatePreview();
    setStatus(
      "Rascunho de nova versão preparado. Revise todas as capacidades antes de gravar. " +
      "Nada foi publicado ou aplicado aos assinantes.",
    );
  }

  /** Prepara o rascunho no fluxo canônico; não envia, publica nem cobra. */
  function prepararPreco() {
    const valor = priceAmount.trim().replace(",", ".");
    if (!/^\\d+(?:\\.\\d{1,2})?$/.test(valor) || Number(valor) <= 0) {
      setStatus("Informe um preço positivo com até duas casas decimais.");
      return;
    }
    if (!planVersionId.trim()) {
      setStatus("Selecione ou informe uma versão de plano válida.");
      return;
    }
    if (!priceReason.trim()) {
      setStatus("Informe a justificativa de criação do preço.");
      return;
    }
    const partes = valor.split(".");
    const normalizado = `${partes[0]}.${(partes[1] ?? "").padEnd(2, "0")}`;
    setAction("price.create");
    setResourceId(planVersionId.trim());
    setPayload(JSON.stringify({
      currency: "BRL",
      billing_period: billingPeriod,
      amount: normalizado,
      change_policy: priceChangePolicy,
      change_reason: priceReason.trim(),
    }, null, 2));
    invalidatePreview();
    setStatus(
      "Rascunho preparado. Nenhum valor foi gravado ou publicado. " +
      "Confira os campos e utilize a confirmação governada abaixo.",
    );
  }

  function invalidatePreview() {
    setPreview(null);
    setApprovalToken(null);
    setApprovalExpiresAt(null);
    setStatus(null);
  }

  async function send(
    selectedAction: string,
    selectedPayload: Record<string, unknown>,
    options?: {
      approvalToken?: string;
    },
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
          approvalToken: options?.approvalToken,
        }),
      },
    );
    const body = (await response.json()) as Record<string, unknown> & {
      error?: string;
      approval?: {
        token?: unknown;
        expiresAt?: unknown;
      };
    };
    if (!response.ok) {
      const code = body.error ?? "commercial.operation_failed";
      throw new Error(mensagemFalha(code, response.status));
    }
    return body;
  }

  function parsePayload(): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(payload) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setStatus("Os dados da operação precisam ser um objeto JSON.");
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      setStatus("Os dados da operação não formam um JSON válido.");
      return null;
    }
  }

  async function showPreview() {
    if (!requiredPreview) return;
    const proposedPayload = parsePayload();
    if (!proposedPayload) return;

    setBusy(true);
    setStatus(null);
    try {
      const body = await send(requiredPreview, proposedPayload);
      const token = body.approval?.token;
      const expiresAt = body.approval?.expiresAt;
      if (typeof token !== "string" || typeof expiresAt !== "string") {
        throw new Error("A prévia foi retornada sem uma aprovação governada válida.");
      }
      setPreview(JSON.stringify(body.result ?? body, null, 2));
      setApprovalToken(token);
      setApprovalExpiresAt(expiresAt);
      setStatus(
        `Prévia canônica carregada e vinculada a esta publicação. Aprovação válida até ${new Date(expiresAt).toLocaleTimeString("pt-BR")}.`,
      );
    } catch (error) {
      setPreview(null);
      setApprovalToken(null);
      setApprovalExpiresAt(null);
      setStatus(error instanceof Error ? error.message : "Não foi possível carregar a prévia.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parsePayload();
    if (!parsed) return;

    if (requiredPreview && (!preview || !approvalToken)) {
      setStatus("Visualize a prévia canônica antes de confirmar a publicação.");
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      await send(action, parsed, {
        approvalToken: approvalToken ?? undefined,
      });
      setStatus("Comando aceito pela autoridade comercial canônica.");
      setPassword("");
      setPreview(null);
      setApprovalToken(null);
      setApprovalExpiresAt(null);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Os dados são inválidos ou o comando não pôde ser enviado.",
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
        Toda alteração exige reautenticação por senha e é encaminhada para a
        Plataforma Comercial canônica. Publicações de alto risco exigem uma
        prévia aprovada pelo servidor antes da confirmação.
      </p>
      <section aria-labelledby="kordena-plan-editor-title" className="card">
        <span className="eyebrow">FM Command · Quatro planos versionados</span>
        <h3 id="kordena-plan-editor-title">Configurar limites e franquias</h3>
        <p>
          Prepare uma nova versão de plano sem apagar as capacidades já
          publicadas. Os valores permanecem rascunho até validação e
          publicação separadas. Nenhum limite está pré-aprovado.
        </p>
        <label>
          Plano comercial
          <select value={planCode} onChange={(event) => setPlanCode(event.target.value)}>
            {["KORDENA_PLAN_A", "KORDENA_PLAN_B", "KORDENA_PLAN_C", "KORDENA_PLAN_D"].map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </label>
        <label>
          Nome comercial do plano
          <input value={planDisplayName} onChange={(event) => setPlanDisplayName(event.target.value)}
            maxLength={128} placeholder="A definir" />
        </label>
        <label>
          Capacidade ou modalidade autorizada
          <input value={entitlementKey} onChange={(event) => setEntitlementKey(event.target.value)}
            maxLength={128} placeholder="Ex.: ai.tool_planning" />
        </label>
        <label>
          Quantidade de franquia
          <input inputMode="decimal" value={entitlementLimit}
            onChange={(event) => setEntitlementLimit(event.target.value)}
            placeholder="A definir" />
        </label>
        <label>
          Unidade da franquia
          <input value={entitlementUnit} onChange={(event) => setEntitlementUnit(event.target.value)}
            maxLength={32} placeholder="credits" />
        </label>
        <button className="button" type="button" disabled={busy}
          onClick={prepararPlano}>Preparar nova versão de plano</button>
        <small>
          A proteção financeira da IA também exige o Budget Guard interno no
          Kordena. Alterar esta versão não constitui reserva de orçamento nem
          ativa cobrança automaticamente.
        </small>
      </section>
      <section aria-labelledby="kordena-price-editor-title" className="card">
        <span className="eyebrow">FM Command · Valores configuráveis</span>
        <h3 id="kordena-price-editor-title">Configurar preços do Kordena</h3>
        <p>
          Os preços ainda serão definidos pela FM Tecnologia. O formulário
          apenas prepara um rascunho para a Plataforma Comercial versionada do
          Kordena. Criar preço não ativa cobrança; validar e publicar são
          operações independentes e governadas.
        </p>
        <label>
          Versão de plano
          <select value={planVersionId} onChange={(event) => setPlanVersionId(event.target.value)}>
            <option value="">Selecione uma versão existente</option>
            {effectivePlanVersions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Identificador de versão (para versões ainda não publicadas)
          <input value={planVersionId} onChange={(event) => setPlanVersionId(event.target.value)}
            placeholder="Identificador fornecido ao criar a versão de plano" />
        </label>
        <label>
          Preço da assinatura em reais (R$)
          <input inputMode="decimal" value={priceAmount}
            onChange={(event) => setPriceAmount(event.target.value)}
            placeholder="A definir — informe somente depois da decisão comercial" />
        </label>
        <label>
          Periodicidade
          <select value={billingPeriod}
            onChange={(event) => setBillingPeriod(event.target.value as "monthly" | "yearly")}>
            <option value="monthly">Mensal</option>
            <option value="yearly">Anual</option>
          </select>
        </label>
        <label>
          Política de alteração para contratos
          <select value={priceChangePolicy}
            onChange={(event) => setPriceChangePolicy(event.target.value)}>
            <option value="new_customers_only">Somente novos clientes</option>
            <option value="at_next_renewal">Na próxima renovação</option>
            <option value="migration_scheduled">Migração programada</option>
            <option value="manual_migration">Migração manual governada</option>
          </select>
        </label>
        <label>
          Justificativa
          <input value={priceReason} onChange={(event) => setPriceReason(event.target.value)}
            maxLength={255} />
        </label>
        <button className="button" type="button" disabled={busy}
          onClick={prepararPreco}>
          Preparar preço em rascunho
        </button>
        <small>
          Sem valor configurado, nenhuma mensalidade é presumida. Esta área
          não altera os custos privados dos modelos nem disponibiliza planos
          automaticamente a clientes.
        </small>
      </section>
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
              {ACTION_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Identificador do recurso
        <input
          value={resourceId}
          onChange={(event) => {
            setResourceId(event.target.value);
            invalidatePreview();
          }}
        />
      </label>
      <label>
        Dados canônicos da operação (JSON)
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
          {busy ? "Carregando…" : "Visualizar prévia antes de publicar"}
        </button>
      ) : null}
      {preview ? (
        <pre className="card" aria-label="Prévia canônica das alterações">
          {preview}
        </pre>
      ) : null}
      {approvalExpiresAt ? (
        <small>
          Aprovação server-side temporária vinculada a esta operação. Alterar
          ação, recurso, dados ou senha invalida a prévia.
        </small>
      ) : null}
      <button
        className="button primary"
        type="submit"
        disabled={busy || Boolean(requiredPreview && !approvalToken)}
      >
        {busy ? "Confirmando…" : "Reautenticar e confirmar"}
      </button>
      {status ? <p role="status">{status}</p> : null}
    </form>
  );
}
