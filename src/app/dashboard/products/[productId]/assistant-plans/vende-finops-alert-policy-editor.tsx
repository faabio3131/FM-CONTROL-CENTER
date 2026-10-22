"use client";
import {useState} from "react";

type Read={
  configured:boolean;revision:number|null;enabled:boolean;
  currency:string|null;maximum_known_cost:string|null;
};
export function VendeFinopsAlertPolicyEditor({productId}:{productId:string}){
  const [tenant,setTenant]=useState("");
  const [unit,setUnit]=useState("");
  const [policy,setPolicy]=useState<Read|null>(null);
  const [limit,setLimit]=useState("0.05");
  const [enabled,setEnabled]=useState(true);
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const endpoint=`/api/billing/products/${encodeURIComponent(productId)}/vende-core-finops/alert-policy`;
  const reset=()=>{setPolicy(null);setError("");setNotice("");setPassword("");};
  async function load(){
    setBusy(true);setError("");setNotice("");setPolicy(null);
    try{
      const url=endpoint+"?"+new URLSearchParams({externalTenantId:tenant,unitId:unit});
      const r=await fetch(url,{cache:"no-store"});
      if(!r.ok)throw Error("unavailable");
      const p=await r.json() as Read;
      if(typeof p.configured!=="boolean"||typeof p.enabled!=="boolean"||
         (p.configured&&(!Number.isSafeInteger(p.revision)||p.currency!=="USD"||
          typeof p.maximum_known_cost!=="string")))throw Error("invalid");
      setPolicy(p);
      setEnabled(p.configured?p.enabled:true);
      setLimit(p.configured?p.maximum_known_cost??"0.05":"0.05");
    }catch{setError("Não foi possível consultar a política do Core. Nenhuma configuração foi presumida.");}
    finally{setBusy(false);}
  }
  async function save(){
    if(!policy)return;
    setBusy(true);setError("");setNotice("");
    try{
      const r=await fetch(endpoint,{
        method:"POST",headers:{"Content-Type":"application/json"},
        cache:"no-store",body:JSON.stringify({
          externalTenantId:tenant,unitId:unit,currency:"USD",
          expectedRevision:policy.revision??0,enabled,
          maximumKnownCost:limit,password,
        }),
      });
      if(!r.ok)throw Error("denied");
      setPassword("");
      setPolicy(null);
      setNotice("Solicitação confirmada. Reconsulte o Core para conferir a nova revisão.");
    }catch{
      setPassword("");
      setPolicy(null);
      setError("Alteração não confirmada. Reconsulte a revisão antes de qualquer nova tentativa.");
    }finally{setBusy(false);}
  }
  return <section className="card" aria-label="Política corporativa de alertas FinOps">
    <span className="eyebrow">FM Tecnologia · Governança de custos de IA</span>
    <h2>Limite de alerta por cliente e unidade</h2>
    <p>Configure o limiar de custo estimado por solicitação, em USD. Esta regra não altera
      a franquia do cliente, não liquida custos e não executa cobranças. Custos desconhecidos
      continuam exigindo atenção mesmo com os alertas monetários desativados.</p>
    <div className="form-grid">
      <label>Tenant VendeAtendeIA
        <input type="text" value={tenant} maxLength={128} disabled={busy}
          onChange={e=>{setTenant(e.target.value);reset();}}/>
      </label>
      <label>Unidade VendeAtendeIA
        <input type="text" value={unit} maxLength={128} disabled={busy}
          onChange={e=>{setUnit(e.target.value);reset();}}/>
      </label>
    </div>
    <button type="button" className="button" disabled={busy||!tenant||!unit}
      onClick={()=>void load()}>Consultar política vigente</button>
    {policy?<div className="form-grid">
      <p>Revisão canônica: <strong>{policy.revision??"Não configurada"}</strong></p>
      <label>Alerta monetário ativo
        <input type="checkbox" checked={enabled} disabled={busy}
          onChange={e=>setEnabled(e.target.checked)}/>
      </label>
      <label>Limite de custo estimado por requisição (USD)
        <input type="text" inputMode="decimal" value={limit} disabled={busy}
          onChange={e=>setLimit(e.target.value)} maxLength={80}/>
      </label>
      <label>Confirme com sua senha corporativa
        <input type="password" autoComplete="off" value={password} disabled={busy}
          onChange={e=>setPassword(e.target.value)} maxLength={128}/>
      </label>
      <button type="button" className="button" disabled={busy||!password||!limit}
        onClick={()=>void save()}>Salvar política com reautenticação</button>
    </div>:null}
    {busy?<p role="status">Verificando...</p>:null}
    {error?<p role="alert">{error}</p>:null}
    {notice?<p role="status">{notice}</p>:null}
  </section>;
}
