"use client";
import {useState} from "react";
import type {FMFinopsOperationalOutbox} from "@/application/billing/vende-core-finops-policy";

type Item=FMFinopsOperationalOutbox["items"][number];
export function VendeFinopsOperationalAlerts({productId}:{productId:string}){
  const today=new Date().toISOString().slice(0,10);
  const [tenant,setTenant]=useState("");
  const [unit,setUnit]=useState("");
  const [start,setStart]=useState(today);
  const [end,setEnd]=useState(today);
  const [password,setPassword]=useState("");
  const [items,setItems]=useState<Item[]>([]);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");
  const endpoint="/api/billing/products/"+encodeURIComponent(productId)+
    "/vende-core-finops/alert-operations";
  const reset=()=>{setItems([]);setNextCursor(null);setStatus("");setError("");setPassword("");};
  async function refresh(){
    setBusy(true);setError("");setStatus("");
    try{
      const q=new URLSearchParams({externalTenantId:tenant,unitId:unit});
      const res=await fetch(endpoint+"?"+q,{cache:"no-store"});
      if(!res.ok)throw Error("unavailable");
      const data=await res.json() as FMFinopsOperationalOutbox;
      if(data.provider_invoice_verified!==false||
         data.automated_dispatch_enabled!==false||
         !Array.isArray(data.items)||data.items.length>50)throw Error("untrusted");
      setItems(data.items);
      setStatus(data.items.length+" alertas aguardando revisão. A lista exibe até 50 registros.");
    }catch{
      setItems([]);
      setError("Fila não confirmada pelo Core. Nenhum alerta será presumido.");
    }finally{setBusy(false);}
  }
  async function action(kind:"scan"|"review",eventId?:string,continueScan=false){
    if(!password)return;
    setBusy(true);setError("");setStatus("");
    try{
      const payload=kind==="scan"?
        {kind,externalTenantId:tenant,unitId:unit,startDate:start,endDate:end,password,
         ...(continueScan&&nextCursor?{afterRequestId:nextCursor}:{})}:
        {kind,externalTenantId:tenant,unitId:unit,eventId,password};
      const res=await fetch(endpoint,{
        method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",
        body:JSON.stringify(payload),
      });
      if(!res.ok)throw Error("not_confirmed");
      const reply=await res.json() as {
        status:string;kind:string;created?:number;scanned?:number;nextCursor?:string|null;
      };
      if(reply.status!=="accepted"||reply.kind!==kind)throw Error("invalid_ack");
      setItems([]);
      setNextCursor(kind==="scan"?reply.nextCursor??null:null);
      setStatus(kind==="scan"?
        "Varredura interna confirmada: "+reply.created+" novos alertas em "+
        reply.scanned+" solicitações. Consulte a fila para atualizar."+
        (reply.nextCursor?" Há mais solicitações na janela; execute uma nova página autorizada.":""):
        "Revisão registrada no Core. Reconsulte a fila para verificar o estado.");
    }catch{
      setItems([]);
      setError("Operação não confirmada. Consulte o Core antes de repetir; não há retry automático.");
    }finally{setPassword("");setBusy(false);}
  }
  return <section className="card" aria-label="Operação corporativa de alertas FinOps">
    <span className="eyebrow">FM Tecnologia · Construção F3</span>
    <h2>Fila operacional de alertas de IA</h2>
    <p>Materializa alertas a partir do consumo registrado e permite revisão administrativa.
      Não altera franquias, não confirma faturas de provedores e não envia mensagens externas.</p>
    <div className="form-grid">
      <label>Tenant VendeAtendeIA
        <input value={tenant} maxLength={128} disabled={busy}
          onChange={e=>{setTenant(e.target.value);reset();}}/>
      </label>
      <label>Unidade
        <input value={unit} maxLength={128} disabled={busy}
          onChange={e=>{setUnit(e.target.value);reset();}}/>
      </label>
      <label>Data inicial da varredura
        <input type="date" value={start} disabled={busy}
          onChange={e=>{setStart(e.target.value);reset();}}/>
      </label>
      <label>Data final (até 31 dias)
        <input type="date" value={end} disabled={busy}
          onChange={e=>{setEnd(e.target.value);reset();}}/>
      </label>
      <label>Senha corporativa para processar ou revisar
        <input type="password" autoComplete="off" value={password} maxLength={128}
          disabled={busy} onChange={e=>setPassword(e.target.value)}/>
      </label>
    </div>
    <button className="button" type="button" disabled={busy||!tenant||!unit}
      onClick={()=>void refresh()}>Consultar fila persistente</button>
    <button className="button" type="button"
      disabled={busy||!tenant||!unit||!password||!start||!end}
      onClick={()=>void action("scan")}>Processar janela com reautenticação</button>
    {nextCursor?<button className="button" type="button"
      disabled={busy||!password}
      onClick={()=>void action("scan",undefined,true)}>
      Processar próxima página autorizada
    </button>:null}
    {items.map(item=><article className="card" key={item.event_id}>
      <strong>{item.request_id}</strong>
      <p>Revisão {item.policy_revision} · Subtotal interno: {item.known_cost_subtotal}
        {" "}{item.currency??"moeda desconhecida"} · Tentativas sem custo:
        {" "}{item.unknown_attempts}/{item.observed_attempts}</p>
      <p>Motivos: {item.reasons.join(", ")}</p>
      <button className="button" type="button" disabled={busy||!password}
        onClick={()=>void action("review",item.event_id)}>Marcar como revisado</button>
    </article>)}
    {busy?<p role="status">Verificando o Core...</p>:null}
    {status?<p role="status">{status}</p>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
