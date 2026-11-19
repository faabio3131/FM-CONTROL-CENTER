"use client";
import { useState,type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { IRON_FOUR_TIER_OFFERS,IRON_FOUR_TIER_APPROVAL,IRON_FOUR_TIER_REVIEW_VERSION } from "@/domain/billing/iron-four-tier-offers";

export function IronFourTierPublicationForm({productId,canWrite}:{productId:string;canWrite:boolean}){
  const router=useRouter();
  const [approval,setApproval]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function publish(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!canWrite||busy||approval!==IRON_FOUR_TIER_APPROVAL||!password.trim())return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/billing/products/"+encodeURIComponent(productId)+"/iron-plan-mappings/publish-four-tiers",{
        method:"POST",cache:"no-store",headers:{"content-type":"application/json"},
        body:JSON.stringify({approval,password,reviewVersion:IRON_FOUR_TIER_REVIEW_VERSION}),
      });
      const result=await response.json();
      if(!response.ok){
        const messages:Record<string,string>={
          "billing.iron_rollout_cakto_offer_missing":"Configure as oito ofertas Cakto com o código, valor e recorrência correspondentes. Nenhuma alteração foi aplicada.",
          "billing.iron_rollout_gateway_not_ready":"Gateway Cakto de produção não está habilitado para IRON.",
          "billing.iron_rollout_version_not_published":"O catálogo IRON não confirmou todas as quatro versões v1.",
          "billing.iron_rollout_immutable_price_conflict":"Preço existente divergente; não será sobrescrito.",
          "billing.iron_plan_mapping_immutable":"Vínculo existente divergente; não será sobrescrito.",
        };
        setMessage(messages[result?.error]??"Publicação não confirmada. Confira a permissão, os vínculos e a disponibilidade; atualize antes de repetir.");
        return;
      }
      if(result?.paymentExecuted!==false||result?.providerConfigurationVerified!==true||
        !Array.isArray(result?.offers)||result.offers.length!==8||
        !IRON_FOUR_TIER_OFFERS.every(o=>result.offers.some((p:{planCode:string;status:string})=>p.planCode===o.commercialPlanCode&&p.status==="active")))
        throw new Error("unconfirmed");
      setMessage("Oito preços ativos e vinculados às versões IRON v1, com configuração Cakto correspondente. Nenhuma cobrança executada.");
      setApproval("");router.refresh();
    }catch{setMessage("Resultado não confirmado. Atualize a consulta antes de repetir.");}
    finally{setPassword("");setBusy(false);}
  }
  return <div className="panel">
    <h3>Publicação conjunta dos quatro planos</h3>
    <p>Revise os valores da proposta IRON 2026. Esta ação registra e ativa os oito preços no Command em uma única transação, preservando contratos existentes. Requer oito ofertas Cakto configuradas e quatro versões IRON publicadas. Não cria cobranças.</p>
    <div className="foundation-grid">{IRON_FOUR_TIER_OFFERS.map(o=><article key={o.commercialPlanCode}>
      <strong>{o.name}</strong><span>{o.commercialPlanCode}</span>
      <span>{new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(o.amountMinor/100)} · {o.interval==="monthly"?"Mensal":"Anual"}</span>
      <span>{o.ironPlanCode} · v{o.ironPlanVersion}</span>
    </article>)}</div>
    {canWrite?<form className="product-create-form" onSubmit={event=>{void publish(event);}}>
      <label>Confirme: {IRON_FOUR_TIER_APPROVAL}<input value={approval} onChange={e=>setApproval(e.target.value)} disabled={busy} required autoComplete="off"/></label>
      <label>Senha administrativa<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} required/></label>
      <button className="button" type="submit" disabled={busy||approval!==IRON_FOUR_TIER_APPROVAL||!password.trim()}>{busy?"Publicando…":"Publicar as oito ofertas revisadas"}</button>
    </form>:<p>Somente a administração FM pode publicar.</p>}
    {message?<p role="status">{message}</p>:null}
  </div>;
}
