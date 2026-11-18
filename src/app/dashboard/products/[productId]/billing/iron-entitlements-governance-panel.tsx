"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { IronPlanGovernanceCatalog } from "@/infrastructure/integration/iron-commercial-connector";

type Mode = "createPlan" | "createVersion" | "setEntitlement" | "publishVersion" | "retireVersion";

export function IronEntitlementsGovernancePanel({
  productId, canWrite,
}: { productId: string; canWrite: boolean }) {
  const [catalog, setCatalog] = useState<IronPlanGovernanceCatalog | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("createVersion");
  const [planId, setPlanId] = useState("");
  const [draftVersion, setDraftVersion] = useState("");
  const [featureKey, setFeatureKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [limit, setLimit] = useState("0");
  const [policyValues, setPolicyValues] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const endpoint = "/api/billing/products/" + encodeURIComponent(productId) + "/iron-entitlements";
  async function refreshCatalog() {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error("CATALOG_UNAVAILABLE");
    const value: IronPlanGovernanceCatalog = await response.json();
    if (!Array.isArray(value.plans) || !Array.isArray(value.capabilities)) throw new Error("CATALOG_INVALID");
    setCatalog(value);
    setUnavailable(false);
  }
  useEffect(() => {
    let active = true;
    void fetch(endpoint, { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("CATALOG_UNAVAILABLE");
      const value: IronPlanGovernanceCatalog = await response.json();
      if (!Array.isArray(value.plans) || !Array.isArray(value.capabilities)) throw new Error("CATALOG_INVALID");
      if (active) { setCatalog(value); setUnavailable(false); }
    }).catch(() => { if (active) setUnavailable(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint]);

  const chosenPlan = catalog?.plans.find(plan => plan.id === planId);
  const maxVersion = Math.max(0, ...(chosenPlan?.versions.map(v => v.version) ?? []));
  const versionNumber = Number(draftVersion);
  const chosenDraft = chosenPlan?.versions.find(v => v.version === versionNumber && v.status === "DRAFT");
  const chosenPublished = chosenPlan?.versions.find(v => v.version === versionNumber && v.status === "PUBLISHED");
  const capabilities = catalog?.capabilities.filter(c => c.status === "ACTIVE") ?? [];
  const capability = capabilities.find(c => c.key === featureKey);
  const policy = policyValues.split(",").map(x => x.trim()).filter(Boolean);
  const entitlementInput = capability?.kind === "FEATURE"
    ? { featureKey, featureEnabled: enabled }
    : capability?.kind === "LIMIT"
    ? { featureKey, limitValue: Number(limit) }
    : { featureKey, policyValues: policy };

  const valid = mode === "createPlan"
    ? /^[A-Z][A-Z0-9_]{1,63}$/.test(newCode) && newName.trim().length >= 2 &&
        !catalog?.plans.some(plan => plan.code === newCode)
    : mode === "createVersion" ? !!chosenPlan && maxVersion < 2147483647
    : mode === "setEntitlement" ? !!chosenDraft && !!capability &&
        (capability.kind === "FEATURE" || capability.kind === "LIMIT" &&
          Number.isSafeInteger(Number(limit)) && Number(limit) >= 0 && limit.trim() !== "" ||
          capability.kind === "POLICY" && policy.length > 0 &&
          new Set(policy).size === policy.length && policy.every(v => capability.allowedPolicyValues?.includes(v)))
    : mode === "retireVersion" ? !!chosenPublished : !!chosenDraft && chosenDraft.entitlements.length > 0;
  const fingerprint = JSON.stringify({
    mode, planId, version: mode === "createVersion" ? maxVersion + 1 : versionNumber,
    newCode, newName, ...((mode === "setEntitlement") ? entitlementInput : {}),
    count: chosenDraft?.entitlements.length ?? chosenPublished?.entitlements.length,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalog || unavailable || !canWrite || busy || !valid ||
      preview !== fingerprint || !password.trim()) {
      setMessage("Revise os dados da operação e confirme a prévia antes de prosseguir.");
      return;
    }
    setBusy(true); setMessage("");
    const payload = mode === "createPlan"
      ? { action: mode, code: newCode, name: newName.trim() }
      : mode === "createVersion"
      ? { action: mode, planId, version: maxVersion + 1 }
      : mode === "setEntitlement"
      ? { action: mode, planId, version: versionNumber, ...entitlementInput }
      : { action: mode, planId, version: versionNumber, confirm: mode === "retireVersion" ? "RETIRAR_VERSAO_NAO_VINCULADA" : "PUBLICAR_VERSAO_IMUTAVEL" };
    try {
      const response = await fetch(endpoint, {
        method: "POST", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, password }),
      });
      if (!response.ok) {
        setMessage(response.status === 403 ? "Reautenticação ou permissão negada." :
          response.status === 400 ? "Dados inválidos para o plano canônico." :
          response.status === 409 ? "A versão está vinculada ou o catálogo mudou. Revise antes de prosseguir." :
          "Operação não confirmada pelo IRON. Nenhuma alteração deve ser presumida.");
        return;
      }
      // A successful command is not treated as a valid read model until
      // the canonical IRON catalog confirms the result.
      await refreshCatalog();
      setPreview(""); setPassword("");
      setMessage("Alteração confirmada pela autoridade canônica do IRON. Nenhuma licença foi concedida a uma academia.");
    } catch {
      setMessage("Falha de comunicação/readback. Consulte o catálogo antes de repetir; não presuma gravação.");
    } finally {
      setPassword(""); setBusy(false);
    }
  }

  return <section className="panel" aria-label="Governança de direitos dos planos IRON">
    <h3>Direitos, limites e versões do IRON</h3>
    <p>Governança da FM sobre o catálogo real: rascunho → recursos e cotas → revisão → publicação imutável. O servidor IRON valida os recursos e preserva os direitos das academias existentes.</p>
    {loading ? <p role="status">Consultando catálogo canônico de planos…</p> :
      unavailable || !catalog ? <p role="alert">Governança indisponível: conexão ou autorização dedicada não configurada. Nenhuma alteração é permitida.</p> :
      <>
        <div className="foundation-grid">
          {catalog.plans.map(plan => <article key={plan.id}>
            <strong>{plan.name}</strong><span>{plan.code}</span>
            <span>{plan.versions.map(v => "v" + v.version + " · " +
              (v.status === "DRAFT" ? "Rascunho" : v.status === "PUBLISHED" ? "Publicada" : "Retirada")).join(" | ") || "Sem versões"}</span>
          </article>)}
        </div>
        {!canWrite ? <p>Seu perfil possui consulta, mas não pode alterar planos.</p> :
        <form onSubmit={event => { void submit(event); }} className="product-create-form">
          <label>Operação governada
            <select value={mode} disabled={busy} onChange={e => { setMode(e.target.value as Mode); setPreview(""); }}>
              <option value="createPlan">Criar plano canônico</option>
              <option value="createVersion">Criar versão de rascunho</option>
              <option value="setEntitlement">Configurar direito ou limite no rascunho</option>
              <option value="publishVersion">Publicar versão imutável</option>
              <option value="retireVersion">Retirar versão sem vínculos</option>
            </select>
          </label>
          {mode === "createPlan" ? <>
            <label>Código canônico do plano
              <input value={newCode} onChange={e => { setNewCode(e.target.value.toUpperCase()); setPreview(""); }} maxLength={64} required disabled={busy} placeholder="IRON_NOVO"/>
            </label>
            <label>Nome
              <input value={newName} onChange={e => { setNewName(e.target.value); setPreview(""); }} required maxLength={120} disabled={busy}/>
            </label>
          </> : <>
            <label>Plano canônico
              <select value={planId} onChange={e => { setPlanId(e.target.value); setDraftVersion(""); setPreview(""); }} disabled={busy} required>
                <option value="">Selecione um plano</option>
                {catalog.plans.map(p => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
              </select>
            </label>
            {mode === "createVersion" ? <p>Próxima versão: {maxVersion + 1}. Ela nasce em rascunho e não altera assinaturas existentes.</p> :
              <label>{mode === "retireVersion" ? "Versão publicada" : "Versão em rascunho"}
                <select value={draftVersion} onChange={e => { setDraftVersion(e.target.value); setPreview(""); }} disabled={busy} required>
                  <option value="">Selecione uma versão</option>
                  {chosenPlan?.versions.filter(v => v.status === (mode === "retireVersion" ? "PUBLISHED" : "DRAFT")).map(v =>
                    <option key={v.version} value={String(v.version)}>v{v.version} · {v.entitlements.length} recursos</option>)}
                </select>
              </label>
            }
          </>}
          {mode === "setEntitlement" ? <>
            <label>Capacidade definida no catálogo do IRON
              <select value={featureKey} onChange={e => { setFeatureKey(e.target.value); setPreview(""); }} disabled={busy} required>
                <option value="">Selecione uma capacidade</option>
                {capabilities.map(c => <option key={c.key} value={c.key}>{c.description} · {c.key} ({c.kind})</option>)}
              </select>
            </label>
            {capability?.kind === "FEATURE" ? <label>
              <input type="checkbox" checked={enabled} onChange={e => { setEnabled(e.target.checked); setPreview(""); }} disabled={busy}/> Recurso habilitado
            </label> : capability?.kind === "LIMIT" ? <label>Limite máximo autorizado
              <input type="number" min="0" step="1" value={limit} onChange={e => { setLimit(e.target.value); setPreview(""); }} required disabled={busy}/>
            </label> : capability?.kind === "POLICY" ? <label>Valores permitidos (separados por vírgula)
              <input value={policyValues} onChange={e => { setPolicyValues(e.target.value); setPreview(""); }} required disabled={busy}/>
              <small>Valores válidos: {capability.allowedPolicyValues?.join(", ")}</small>
            </label> : null}
          </> : null}
          {mode === "publishVersion" ? <p>A publicação é definitiva para esta versão. Modificações posteriores exigem uma nova versão; não concede novas licenças automaticamente.</p> : null}
          {mode === "retireVersion" ? <p>Somente versões sem vínculo comercial, preços, contratos ou Launch Matrix podem ser retiradas. A retirada é definitiva e não cancela assinaturas.</p> : null}
          {valid ? <div role="status"><strong>Prévia:</strong> {mode === "createPlan" ? newCode :
            chosenPlan?.code + " v" + (mode === "createVersion" ? maxVersion + 1 : versionNumber)} ·
            {mode === "setEntitlement" ? " " + featureKey : mode === "publishVersion" ? " publicação imutável" : mode === "retireVersion" ? " retirada irreversível, condicionada à ausência de vínculos" : " cadastro governado"}</div> : null}
          <button type="button" className="button" disabled={!valid || busy} onClick={() => { setPreview(fingerprint); setMessage("Prévia confirmada. Informe sua senha administrativa para executar."); }}>
            Confirmar prévia
          </button>
          {preview === fingerprint && valid ? <>
            <label>Senha administrativa FM (reautenticação obrigatória)
              <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} required/>
            </label>
            <button className="button" type="submit" disabled={busy || !password.trim()}>
              {busy ? "Validando no IRON…" : "Executar operação governada"}
            </button>
          </> : null}
          {message ? <p role="status">{message}</p> : null}
        </form>}
      </>}
  </section>;
}
