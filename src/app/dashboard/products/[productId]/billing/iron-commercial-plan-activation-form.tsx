"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type { BillingProductPlanView } from "@/application/billing/product-billing-authority-service";
import type { IronVersionedPlanMapping } from "@/domain/billing/iron-versioned-plan-mapping";
import type { IronPublishedPlanVersion } from "@/infrastructure/integration/iron-commercial-connector";

/**
 * Activates only the FM commercial offer. Does not execute checkout, send a
 * subscription command to IRON, trigger gateway payment or grant entitlement.
 */
export function IronCommercialPlanActivationForm(props: {
  productId: string;
  plans: readonly BillingProductPlanView[];
  mappings: readonly IronVersionedPlanMapping[];
  publishedPlans: readonly IronPublishedPlanVersion[];
  mappingAvailable: boolean;
  publishedPlansAvailable: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [commercialPlanCode, setCommercialPlanCode] = useState("");
  const [approval, setApproval] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const candidates = useMemo(() => props.plans.filter(plan =>
    plan.status === "inactive" &&
    props.mappings.some(mapping => mapping.commercialPlanCode === plan.planCode &&
      props.publishedPlans.some(published => published.planCode === mapping.ironPlanCode &&
        published.version === mapping.ironPlanVersion))
  ), [props.plans, props.mappings, props.publishedPlans]);

  const plan = candidates.find(candidate => candidate.planCode === commercialPlanCode);
  const mapping = props.mappings.find(candidate => candidate.commercialPlanCode === plan?.planCode);
  const published = props.publishedPlans.find(candidate => candidate.planCode === mapping?.ironPlanCode &&
    candidate.version === mapping?.ironPlanVersion);
  const available = props.canWrite && props.mappingAvailable && props.publishedPlansAvailable &&
    candidates.length > 0;
  const amount = plan
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(plan.amountMinor / 100)
    : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available || !plan || !mapping || !published || busy ||
        approval !== "ATIVAR" || !password.trim()) {
      setMessage("Selecione um plano válido, confirme ATIVAR e informe a senha administrativa.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        "/api/billing/products/" + encodeURIComponent(props.productId) + "/iron-plan-mappings/activate",
        {
          method: "POST", cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            commercialPlanCode: plan.planCode,
            expectedAmountMinor: plan.amountMinor,
            expectedIronPlanCode: mapping.ironPlanCode,
            expectedIronPlanVersion: mapping.ironPlanVersion,
            expectedMappingRevision: mapping.revision,
            approval,
            password,
          }),
        },
      );
      if (!response.ok) {
        setMessage(response.status === 403 || response.status === 401
          ? "Acesso não autorizado. Verifique a permissão e a reautenticação administrativa."
          : response.status === 409
            ? "Os dados comerciais, o vínculo ou o catálogo do IRON mudaram. Atualize e revise antes de repetir."
            : "Não foi possível confirmar a ativação. Atualize a consulta antes de tentar novamente.");
        return;
      }
      setCommercialPlanCode("");
      setApproval("");
      setMessage("Oferta comercial ativada. Nenhuma fatura ou licença foi criada por esta operação.");
      router.refresh();
    } catch {
      setMessage("Conexão indisponível. Confira o status do plano antes de repetir a operação.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  if (!props.canWrite) {
    return <p>Somente administração autorizada da FM pode ativar ofertas comerciais.</p>;
  }
  if (!props.mappingAvailable || !props.publishedPlansAvailable) {
    return <p role="status">Não foi possível verificar o vínculo ou o catálogo publicado do IRON. Ativação bloqueada.</p>;
  }
  if (candidates.length === 0) {
    return <p>Não há planos inativos com vínculo confirmado a uma versão publicada do IRON para ativação.</p>;
  }

  return <form className="product-create-form" onSubmit={event => { void submit(event); }}>
    <label>Preço comercial inativo e vinculado
      <select value={commercialPlanCode} disabled={busy} required
        onChange={event => {
          setCommercialPlanCode(event.target.value);
          setApproval("");
          setPassword("");
          setMessage("");
        }}>
        <option value="">Selecione o plano a revisar</option>
        {candidates.map(candidate => <option key={candidate.id} value={candidate.planCode}>
          {candidate.name} · {candidate.planCode}
        </option>)}
      </select>
    </label>
    {plan && mapping && published ? <div role="status">
      <strong>Revisão antes da ativação</strong>
      <p>Preço FM: {plan.name} · {plan.planCode} · {amount} · {plan.interval === "monthly" ? "mensal" : "anual"}</p>
      <p>Direitos IRON: {published.displayName} · {mapping.ironPlanCode} · versão {mapping.ironPlanVersion} (revisão {mapping.revision})</p>
      <p>Esta ação apenas disponibiliza o preço comercial para futuras contratações.
        Não cobra clientes, não ativa assinaturas nem altera direitos de academias.</p>
    </div> : null}
    {plan && mapping && published ? <>
      <label>Confirmação explícita — digite ATIVAR
        <input value={approval} onChange={event => { setApproval(event.target.value); setMessage(""); }}
          disabled={busy} autoComplete="off" required />
      </label>
      <label>Senha administrativa
        <input type="password" autoComplete="current-password" value={password}
          onChange={event => setPassword(event.target.value)} disabled={busy} required />
      </label>
      <button className="button" type="submit"
        disabled={busy || approval !== "ATIVAR" || !password.trim()}>
        {busy ? "Confirmando ativação…" : "Ativar este preço comercial"}
      </button>
    </> : null}
    {message ? <p role="status">{message}</p> : null}
  </form>;
}
