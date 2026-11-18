"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { IronLegacyLimit } from "@/infrastructure/integration/iron-commercial-connector";

export function IronLegacyLimitsPanel({productId,canWrite}:{productId:string;canWrite:boolean}) {
  const endpoint="/api/billing/products/"+encodeURIComponent(productId)+"/iron-legacy-limits";
  const [customers,setCustomers]=useState<{id:string;name:string}[]>([]);
  const [gymId,setGymId]=useState("");
  const [loadedGym,setLoadedGym]=useState("");
  const [limits,setLimits]=useState<readonly IronLegacyLimit[]>([]);
  const [selected,setSelected]=useState("");
  const [reason,setReason]=useState("");
  const [password,setPassword]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    let active=true;
    void fetch(endpoint,{cache:"no-store"}).then(async response=>{
      if(!response.ok) throw new Error("unavailable");
      const data=await response.json() as {customers:{id:string;name:string}[]};
      if(active) setCustomers(data.customers);
    }).catch(()=>{if(active)setMessage("Não foi possível consultar as academias pelo Command.");});
    return ()=>{active=false;};
  },[endpoint]);
  const row=loadedGym===gymId?limits.find(item=>item.configurationId===selected):undefined;
  const valid=row?.status==="REVIEW_REQUIRED" && row.subscriptionId!==null && row.planCode!==null &&
    row.planVersion!==null && row.legacyLimit!==null && row.planLimit!==null;
  async function review(){
    if(!gymId||busy)return;
    setBusy(true);setLimits([]);setLoadedGym("");setSelected("");setConfirmed(false);setPassword("");setMessage("");
    try{
      const response=await fetch(endpoint+"?gymId="+encodeURIComponent(gymId),{cache:"no-store"});
      if(!response.ok)throw new Error("unavailable");
      const result=await response.json() as {gymId:string;limits:IronLegacyLimit[]};
      if(result.gymId!==gymId||!Array.isArray(result.limits))throw new Error("scope");
      setLoadedGym(gymId);setLimits(result.limits);setMessage(result.limits.length===0?"Nenhuma restrição legada encontrada.":"Limites atuais consultados no IRON.");
    }catch{setMessage("Consulta canônica indisponível. Nenhum direito será alterado.");}
    finally{setBusy(false);}
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!canWrite||!valid||!row||!confirmed||busy||reason.trim().length<10||!password.trim())return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch(endpoint,{method:"POST",cache:"no-store",headers:{"content-type":"application/json"},
        body:JSON.stringify({gymId,featureKey:row.featureKey,configurationId:row.configurationId,
          subscriptionId:row.subscriptionId,planCode:row.planCode,planVersion:row.planVersion,legacyLimit:row.legacyLimit,
          planLimit:row.planLimit,confirm:"ALINHAR_AO_LIMITE_DO_PLANO",reason:reason.trim(),password})});
      if(!response.ok){
        setLoadedGym("");setLimits([]);
        setMessage("Operação não confirmada. Refaça a consulta antes de repetir; o plano pode ter mudado.");
        return;
      }
      const result=await response.json() as {ok:boolean;gymId:string;limits:IronLegacyLimit[]};
      if(result.ok!==true||result.gymId!==gymId||!Array.isArray(result.limits)||result.limits.some(l=>l.featureKey===row.featureKey))throw new Error("readback");
      setLoadedGym(gymId);setLimits(result.limits);setSelected("");setReason("");
      setMessage("Alinhamento confirmado pelo IRON. A assinatura e a versão do plano foram preservadas.");
    }catch{
      setLoadedGym("");setLimits([]);setMessage("Resposta inconclusiva. Consulte novamente antes de repetir.");
    }finally{setBusy(false);setConfirmed(false);setPassword("");}
  }
  return <section className="panel" aria-label="Revisão dos limites comerciais legados">
    <h3>Revisão de limites comerciais legados</h3>
    <p>As restrições antigas continuam valendo até revisão explícita da FM. O alinhamento remove apenas a restrição selecionada, mantendo o teto do plano canônico. Nenhuma assinatura é concedida ou modificada.</p>
    <label>Academia
      <select value={gymId} disabled={busy} onChange={e=>{setGymId(e.target.value);setLoadedGym("");setLimits([]);setSelected("");setConfirmed(false);setPassword("");setReason("");setMessage("");}}>
        <option value="">Selecione uma academia</option>
        {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
    <button className="button" type="button" disabled={!gymId||busy} onClick={()=>{void review();}}>Consultar restrições vigentes</button>
    {loadedGym===gymId&&!!gymId&&limits.length>0?<div className="foundation-grid">
      {limits.map(item=><article key={item.configurationId}>
        <strong>{item.featureKey}</strong>
        <span>Restrição: {item.legacyLimit??"Indisponível"} · Limite efetivo: {item.effectiveLimit??"Indisponível"}</span>
        <span>Plano: {item.planCode??"Indisponível"} v{item.planVersion??"—"} · Teto: {item.planLimit??"Indisponível"}</span>
        {item.status==="BLOCKED"?<p>Bloqueada para alinhamento: o estado exige investigação. Nenhum direito será ampliado.</p>:
          canWrite?<button type="button" disabled={busy} className="button" onClick={()=>{setSelected(item.configurationId);setConfirmed(false);setPassword("");setReason("");}}>Revisar este limite</button>:<p>Revisão administrativa necessária.</p>}
      </article>)}
    </div>:null}
    {valid&&row&&canWrite?<form className="product-create-form" onSubmit={e=>{void submit(e);}}>
      <p>Limite efetivo atual: <strong>{row.effectiveLimit}</strong> → limite contratado: <strong>{row.planLimit}</strong>. A mudança {row.planLimit!>row.legacyLimit!?"aumentará explicitamente":"preservará"} o limite efetivo; não afetará outras capacidades.</p>
      <label>Motivo da revisão
        <textarea value={reason} disabled={busy} minLength={10} maxLength={300} required onChange={e=>{setReason(e.target.value);setConfirmed(false);setPassword("");}}/>
      </label>
      <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>{setConfirmed(e.target.checked);setPassword("");}}/> Confirmo a remoção desta restrição e o alinhamento ao teto contratado acima.</label>
      <label>Senha administrativa FM
        <input type="password" autoComplete="current-password" value={password} disabled={!confirmed||busy} onChange={e=>setPassword(e.target.value)} required/>
      </label>
      <button className="button" type="submit" disabled={busy||!confirmed||reason.trim().length<10||!password.trim()}>Executar alinhamento revisado</button>
    </form>:null}
    {message?<p role="status">{message}</p>:null}
  </section>;
}
