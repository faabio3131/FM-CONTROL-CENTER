"use client";
import {useState} from "react";
import type {FMFinopsAlertInbox} from "@/application/billing/vende-core-finops-policy";

type Item=FMFinopsAlertInbox["items"][number];
export function VendeFinopsAlertInbox({productId}:{productId:string}){
  const today=new Date().toISOString().slice(0,10);
  const [tenant,setTenant]=useState("");
  const [unit,setUnit]=useState("");
  const [start,setStart]=useState(today);
  const [end,setEnd]=useState(today);
  const [items,setItems]=useState<Item[]>([]);
  const [next,setNext]=useState<string|null>(null);
  const [seen,setSeen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState<number|null>(null);
  const [active,setActive]=useState(false);
  const reset=()=>{setItems([]);setNext(null);setSeen(false);setError("");};
  async function load(cursor?:string){
    setBusy(true);setError("");
    if(!cursor){setItems([]);setNext(null);setSeen(false);}
    try{
      const q=new URLSearchParams({
        externalTenantId:tenant,unitId:unit,startDate:start,endDate:end,
      });
      if(cursor)q.set("afterRequestId",cursor);
      const res=await fetch(
        `/api/billing/products/${encodeURIComponent(productId)}/vende-core-finops/alert-inbox?`+q,
        {cache:"no-store"},
      );
      if(!res.ok)throw Error("unavailable");
      const data=await res.json() as FMFinopsAlertInbox;
      if(data.provider_invoice_verified!==false||!Array.isArray(data.items)||
         data.items.length>50||typeof data.has_more!=="boolean"||
         data.has_more!==(typeof data.next_cursor==="string"))throw Error("unverified");
      setItems(previous=>cursor?[...previous,...data.items]:data.items);
      setNext(data.next_cursor);
      setRevision(data.policy_revision);
      setActive(data.policy_enabled);
      setSeen(true);
    }catch{
      setError("Não foi possível verificar os alertas no Core. Não há confirmação de custo ou saldo.");
      setNext(null);
    }finally{setBusy(false);}
  }
  return <section className="card" aria-label="Caixa de alertas FinOps FM">
    <span className="eyebrow">FM Tecnologia · Operação interna</span>
    <h2>Alertas de consumo de IA</h2>
    <p>Consulta read-only das solicitações do cliente e unidade. Exibe custos estimados
      e registros incompletos; não comprova fatura de provedor nem altera franquias.</p>
    <div className="form-grid">
      <label>Tenant VendeAtendeIA
        <input value={tenant} maxLength={128} disabled={busy}
          onChange={e=>{setTenant(e.target.value);reset();}}/>
      </label>
      <label>Unidade
        <input value={unit} maxLength={128} disabled={busy}
          onChange={e=>{setUnit(e.target.value);reset();}}/>
      </label>
      <label>Data inicial
        <input type="date" value={start} disabled={busy}
          onChange={e=>{setStart(e.target.value);reset();}}/>
      </label>
      <label>Data final (janela máxima de 31 dias)
        <input type="date" value={end} disabled={busy}
          onChange={e=>{setEnd(e.target.value);reset();}}/>
      </label>
    </div>
    <button className="button" type="button" disabled={busy||!tenant||!unit||!start||!end}
      onClick={()=>void load()}>Consultar alertas no Core</button>
    {seen?<div>
      <p>Revisão do limiar: {revision??"sem política"} · Alerta monetário: {active?"ativo":"inativo"}</p>
      <p>{items.length} solicitações desta consulta, com continuação paginada quando disponível.</p>
      {items.map(item=><article key={item.request_id} className="card">
        <strong>{item.request_id}</strong>
        <p>{item.status==="needs_attention"?"Exige atenção":"Sem alerta nos dados internos observados"}</p>
        <p>Subtotal interno: {item.known_cost_subtotal} {item.currency??"moeda desconhecida"}
          {" · "}Tentativas sem custo: {item.unknown_attempts}/{item.observed_attempts}</p>
        {item.reasons.length?<p>Motivos: {item.reasons.join(", ")}</p>:null}
      </article>)}
      {next?<button type="button" className="button" disabled={busy}
        onClick={()=>void load(next)}>Próxima página</button>:null}
    </div>:null}
    {busy?<p role="status">Consultando o Core...</p>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
