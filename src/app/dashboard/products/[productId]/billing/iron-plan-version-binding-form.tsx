"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type { BillingProductPlanView } from "@/application/billing/product-billing-authority-service";
import type { IronVersionedPlanMapping } from "@/domain/billing/iron-versioned-plan-mapping";
import type { IronPublishedPlanVersion } from "@/infrastructure/integration/iron-commercial-connector";

/** No local entitlement edit: binds a new inactive FM price to an IRON PUBLISHED version. */
export function IronPlanVersionBindingForm(props: {
  productId: string;
  plans: readonly BillingProductPlanView[];
  mappings: readonly IronVersionedPlanMapping[];
  publishedPlans: readonly IronPublishedPlanVersion[];
  mappingAvailable: boolean;
  publishedPlansAvailable: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [commercialCode, setCommercialCode] = useState("");
  const [target, setTarget] = useState("");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const candidates = useMemo(() => props.plans.filter(plan =>
    plan.status === "inactive" &&
    !props.mappings.some(mapping => mapping.commercialPlanCode === plan.planCode)
  ), [props.plans, props.mappings]);
  const targets = props.publishedPlans;
  const available = props.canWrite && props.mappingAvailable &&
    props.publishedPlansAvailable && targets.length > 0 && candidates.length > 0;
  const chosenPlan = candidates.find(plan => plan.planCode === commercialCode);
  const selected = targets.find(plan => target === plan.planCode + ":" + plan.version);
  const fingerprint = selected && chosenPlan
    ? chosenPlan.planCode + ":" + selected.planCode + ":" + selected.version
    : "";
  function invalidate() { setConfirmed(""); setMessage(""); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available || !selected || !chosenPlan || !fingerprint || confirmed !== fingerprint || busy) {
      setMessage("Revise a versão do IRON e confirme os dados antes de registrar.");
      return;
    }
    if (!password.trim()) { setMessage("Reautenticação administrativa obrigatória."); return; }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        "/api/billing/products/" + encodeURIComponent(props.productId) + "/iron-plan-mappings",
        {
          method: "POST", cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            commercialPlanCode: chosenPlan.planCode,
            ironPlanCode: selected.planCode,
            ironPlanVersion: selected.version,
            password,
          }),
        },
      );
      if (!response.ok) {
        setMessage(response.status === 409
          ? "Vínculo rejeitado ou versão do IRON não confirmada. Atualize a página antes de tentar novamente."
          : "Não foi possível registrar o vínculo. Confira a permissão e a configuração canônica.");
        return;
      }
      setMessage("Vínculo versionado registrado. O plano continua inativo e sem cobrança.");
      setConfirmed("");
      setCommercialCode("");
      setTarget("");
      router.refresh();
    } catch {
      setMessage("Conexão indisponível. Verifique o cadastro antes de repetir a operação.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  if (!props.canWrite) {
    return <p>Somente administradores da FM autorizados podem vincular planos.</p>;
  }
  if (!props.mappingAvailable || !props.publishedPlansAvailable) {
    return <p role="status">Catálogo de versões publicadas do IRON ou vínculos atuais indisponíveis. Gravação bloqueada, sem presumir versões.</p>;
  }
  if (targets.length === 0) {
    return <p>O IRON ainda não possui versões publicadas disponíveis para este vínculo.</p>;
  }
  if (candidates.length === 0) {
    return <p>Não há plano comercial inativo e ainda não vinculado. Crie primeiro um novo plano inativo.</p>;
  }

  return (
    <form onSubmit={event => { void submit(event); }} className="product-create-form">
      <label>Plano da FM (inativo e não vinculado)
        <select value={commercialCode} onChange={event => { setCommercialCode(event.target.value); invalidate(); }} required disabled={busy}>
          <option value="">Selecione o preço comercial</option>
          {candidates.map(plan => <option key={plan.id} value={plan.planCode}>
            {plan.name} · {plan.planCode}
          </option>)}
        </select>
      </label>
      <label>Plano e versão canônicos publicados pelo IRON
        <select value={target} onChange={event => { setTarget(event.target.value); invalidate(); }} required disabled={busy}>
          <option value="">Selecione uma versão publicada</option>
          {targets.map(plan => <option key={plan.planCode + ":" + plan.version} value={plan.planCode + ":" + plan.version}>
            {plan.displayName} · {plan.planCode} · versão {plan.version}
          </option>)}
        </select>
      </label>
      <p>O vínculo é imutável. Alterações posteriores exigem novo código comercial. A versão será revalidada no servidor antes da gravação.</p>
      {chosenPlan && selected ? (
        <div role="status">
          <strong>Prévia sem gravação:</strong> preço FM {chosenPlan.planCode} → IRON {selected.planCode},
          versão {selected.version}. Nenhuma assinatura será ativada por esta ação.
        </div>
      ) : null}
      <button className="button" type="button" disabled={busy || !fingerprint}
        onClick={() => { setConfirmed(fingerprint); setMessage("Prévia confirmada. Informe sua senha e registre o vínculo."); }}>
        Confirmar dados da prévia
      </button>
      {confirmed === fingerprint && fingerprint ? (
        <>
          <label>Senha administrativa
            <input type="password" value={password} onChange={event => setPassword(event.target.value)}
              autoComplete="current-password" required disabled={busy}/>
          </label>
          <button className="button" type="submit" disabled={busy || !password.trim()}>
            {busy ? "Registrando…" : "Registrar vínculo imutável"}
          </button>
        </>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
