"use client";
import { useState } from "react";
import type { VendeContractRevisionSnapshot } from "@/domain/billing/vende-contract-snapshot";
type Item={revision:number;action:string;sourceRef:string;actorId:string;effectiveDate:string;
  previousState:string|null;newState:string;termsSnapshot:VendeContractRevisionSnapshot|null;snapshotStatus:string};
export function VendeContractHistory({productId}:{productId:string}){
  const [subscriptionId,setSubscriptionId]=useState("");const [items,setItems]=useState<Item[]>([]);
  const [next,setNext]=useState<number|null>(null);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  async function load(before?:number){
    setBusy(true);setMessage("");
    try{
      const q=new URLSearchParams({subscriptionId,...(before?{beforeRevision:String(before)}:{})});
      const r=await fetch(`/api/billing/products/${encodeURIComponent(productId)}/vende-contract-history?${q}`,{cache:"no-store"});
      if(!r.ok)throw Error("unavailable");const data=await r.json() as {items:Item[];nextBeforeRevision:number|null};
      setItems(old=>before?[...old,...data.items]:data.items);setNext(data.nextBeforeRevision);
      if(!before&&!data.items.length)setMessage("Nenhuma revisão contratual registrada.");
    }catch{if(!before){setItems([]);setNext(null);}setMessage("Histórico indisponível. Confira a assinatura e sua permissão FM.");}
    finally{setBusy(false);}
  }
  return <section className="card" aria-label="Histórico contratual VendeAtendeIA">
    <h2>Histórico dos termos contratados</h2>
    <p>Consulte as condições registradas em cada revisão. Uma intenção pendente não comprova alteração da licença no SaaS.</p>
    <label>Identificador da assinatura<input value={subscriptionId} maxLength={36} disabled={busy} onChange={e=>{setSubscriptionId(e.target.value);setItems([]);setNext(null);setMessage("");}}/></label>
    <button type="button" className="button" disabled={busy||!subscriptionId} onClick={()=>void load()}>Consultar histórico contratual</button>
    {busy?<p role="status">Consultando…</p>:null}{message?<p role="status">{message}</p>:null}
    {items.map(item=><article key={item.revision} className="product-card">
      <h3>Revisão {item.revision} · {item.action}</h3>
      <p>Vigência da alteração: {item.effectiveDate} · {item.previousState??"Sem estado anterior"} → {item.newState}.</p>
      <p>Fonte: {item.sourceRef} · Aprovador: {item.actorId}.</p>
      {item.termsSnapshot?<div className="foundation-grid">{(["before","after"] as const).map(side=>{
        const term=item.termsSnapshot?.[side];return <div key={side}>
          <strong>{side==="before"?"Antes da alteração":"Depois da alteração"}</strong>
          {term?<><p>Início: {term.effectiveFrom} · Período pago até: {term.paidThrough}.</p>
            <p>Vencimento: {term.dueDate} · Calendário: {term.calendarRegion}.</p>
            <p>Renovação automática: {term.autoRenew?"Sim":"Não"}.</p></>:<p>Primeiro registro contratual.</p>}
        </div>;
      })}</div>:<p>Registro histórico sem cópia completa dos termos. As condições antigas não foram reconstruídas.</p>}
    </article>)}
    {next!==null?<button type="button" className="button" disabled={busy} onClick={()=>void load(next)}>Carregar revisões anteriores</button>:null}
  </section>;
}
