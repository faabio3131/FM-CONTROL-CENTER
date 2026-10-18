"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlanAllowance } from "@/domain/billing/assistant-consumption-plan";

type PlanRow = {
  id:string; planCode:string; revision:number; label:string;
  billingInterval:string; amountMinor:number; status:string;
  allowances:PlanAllowance[];
};
const INITIAL:PlanAllowance[]=[
  {resource:"ai.requests",scope:"tenant",limitUnits:1,windowSeconds:2592000},
  {resource:"ai.total_tokens",scope:"tenant",limitUnits:1,windowSeconds:2592000},
];
const METRICS=[
  "ai.requests","ai.total_tokens","ai.input_tokens","ai.output_tokens",
  "ai.cached_tokens","ai.cost_usd_microunits","audio.seconds",
  "whatsapp.messages","automation.executions","storage.bytes",
  "crm.leads","users.seats","units.active",
] as const;

export function AssistantPlanEditor({productId}:{productId:string}) {
  const [plans,setPlans]=useState<PlanRow[]>([]);
  const [planCode,setPlanCode]=useState("");
  const [label,setLabel]=useState("");
  const [amount,setAmount]=useState("");
  const [billingInterval,setBillingInterval]=useState<"monthly"|"yearly">("monthly");
  const [allowances,setAllowances]=useState<PlanAllowance[]>(INITIAL);
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");

  const refresh=useCallback(async()=>{
    const response=await fetch(`/api/billing/products/${productId}/assistant-plans`,{cache:"no-store"});
    if (!response.ok) throw new Error("Não foi possível consultar o catálogo da FM.");
    const data=(await response.json()) as {plans:PlanRow[]};
    setPlans(data.plans);
  },[productId]);
  useEffect(()=>{void refresh().catch(()=>setStatus("Catálogo indisponível."));},[refresh]);

  function setAllowance(index:number, patch:Partial<PlanAllowance>) {
    setAllowances(current=>current.map((item,i)=>i===index?{...item,...patch}:item));
  }
  async function send(action:"create_draft"|"publish", revisionId?:string) {
    if (!password.trim()) {setStatus("Confirme sua senha.");return;}
    setBusy(true);
    setStatus("");
    try {
      const cents=/^(?:0|[1-9]\d*)(?:[.,]\d{1,2})?$/.test(amount.trim())
        ? Number(amount.trim().replace(",","."))
        : NaN;
      const amountMinor=Math.round(cents*100);
      if (action==="create_draft" && (!Number.isSafeInteger(amountMinor) || amountMinor<=0))
        throw new Error("Informe valor positivo em reais, até duas casas decimais.");
      const response=await fetch(`/api/billing/products/${productId}/assistant-plans`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action,password,revisionId,
          plan: action==="create_draft"?{
            planCode:planCode.trim().toUpperCase(),label:label.trim(),
            billingInterval,amountMinor,allowances,
          }:undefined,
        }),
      });
      const data=(await response.json()) as {error?:string};
      if (!response.ok) throw new Error(data.error??"Operação recusada");
      setPassword("");
      setStatus(action==="create_draft"?
        "Rascunho imutável criado. Confira os valores antes de publicá-lo.":
        "Nova revisão publicada pela autoridade FM.");
      await refresh();
    }catch(error){setStatus(error instanceof Error?error.message:"Operação recusada.");}
    finally{setBusy(false);}
  }

  return <div className="card">
    <span className="eyebrow">FM Tecnologia · catálogo corporativo</span>
    <h2>Planos por franquia de consumo</h2>
    <p>Todos os planos oferecem todas as funcionalidades. Apenas a FM define preço e limites.
      Nenhum valor será cobrado nem sincronizado com clientes por este editor isolado.</p>
    <div className="form-grid">
      <label>Código do plano
        <input value={planCode} onChange={e=>setPlanCode(e.target.value)} placeholder="EX.: ATENDE_MENSAL" maxLength={64}/>
      </label>
      <label>Nome comercial
        <input value={label} onChange={e=>setLabel(e.target.value)} maxLength={120}/>
      </label>
      <label>Mensalidade/anuidade (R$)
        <input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="Valor definido pela FM"/>
      </label>
      <label>Periodicidade
        <select value={billingInterval} onChange={e=>setBillingInterval(e.target.value as "monthly"|"yearly")}>
          <option value="monthly">Mensal</option><option value="yearly">Anual</option>
        </select>
      </label>
    </div>
    <h3>Limites de consumo</h3>
    <p>Defina franquias e janelas em segundos. Os valores iniciais são apenas preenchimentos técnicos; ajuste antes de salvar.</p>
    {allowances.map((entry,index)=><div key={index} className="form-grid">
      <label>Recurso
        <select value={entry.resource} onChange={e=>setAllowance(index,{resource:e.target.value as PlanAllowance["resource"]})}>
          {METRICS.map(metric=><option key={metric} value={metric}>{metric}</option>)}
        </select>
      </label>
      <label>Escopo
        <select value={entry.scope} onChange={e=>setAllowance(index,{scope:e.target.value as PlanAllowance["scope"]})}>
          <option value="tenant">Cliente (todas as unidades)</option>
          <option value="unit">Unidade</option>
        </select>
      </label>
      <label>Franquia
        <input type="number" min="1" step="1" value={entry.limitUnits} onChange={e=>setAllowance(index,{limitUnits:Number(e.target.value)})}/>
      </label>
      <label>Janela em segundos
        <input type="number" min="60" step="1" value={entry.windowSeconds} onChange={e=>setAllowance(index,{windowSeconds:Number(e.target.value)})}/>
      </label>
      <button type="button" className="button" onClick={()=>setAllowances(a=>a.filter((_,i)=>i!==index))} disabled={busy}>Excluir limite</button>
    </div>)}
    <button type="button" className="button" disabled={busy||allowances.length>=32}
      onClick={()=>setAllowances(a=>[...a,{resource:"audio.seconds",scope:"tenant",limitUnits:1,windowSeconds:2592000}])}>
      Adicionar limite
    </button>
    <label>Reautenticação corporativa
      <input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/>
    </label>
    <button type="button" className="button" disabled={busy} onClick={()=>void send("create_draft")}>Criar nova revisão em rascunho</button>
    {status?<p role="status">{status}</p>:null}
    <h3>Revisões registradas</h3>
    <div className="product-grid">
      {plans.map(item=><article className="product-card" key={item.id}>
        <strong>{item.label} · {item.planCode} v{item.revision}</strong>
        <span>{item.status} · {item.billingInterval} · BRL {(item.amountMinor/100).toFixed(2)}</span>
        <small>{item.allowances.map(x=>`${x.resource}: ${x.limitUnits} (${x.scope})`).join(" · ")}</small>
        {item.status==="draft"?<button type="button" className="button" disabled={busy}
          onClick={()=>void send("publish",item.id)}>Publicar esta revisão (exige senha)</button>:null}
      </article>)}
    </div>
  </div>;
}
