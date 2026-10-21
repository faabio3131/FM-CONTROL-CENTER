"use client";
import {useState} from "react";
type ReviewStep="unreviewed"|"investigating"|"escalated";
type Case={
  riskId:string;commandId:string;action:string;state:string;reason:string;
  occurredAt:string;reviewVersion:number;reviewStep:ReviewStep;
  reviewer:string|null;reviewedAt:string|null;
};
type ReviewResponse={
  historicalTotal:number;truncated:boolean;items:Case[];
  entitlementVerified:false;automaticCompensationAuthorized:false;
  remoteRemediationCompleted:false;
};
const stepName:Record<ReviewStep,string>={
  unreviewed:"Aguardando revisão",investigating:"Investigação em andamento",
  escalated:"Escalado para reparação supervisionada",
};
function ReviewItem({item,onDone,productId}:{item:Case;onDone:()=>void;productId:string}){
  const [password,setPassword]=useState("");
  const [reasonCode,setReasonCode]=useState("operator_investigation");
  const [decision,setDecision]=useState<"investigating"|"escalated">("investigating");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function submit(){
    setBusy(true);setError("");
    try{
      const response=await fetch(
        `/api/billing/products/${encodeURIComponent(productId)}/vende-compensation-reviews`,{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            commandId:item.commandId,expectedVersion:item.reviewVersion,
            decision,reasonCode,password,
          }),
        },
      );
      if(!response.ok)throw Error("denied");
      setPassword("");onDone();
    }catch{setPassword("");setError("A revisão não foi registrada. Atualize e confira autorização e estado atual.");}
    finally{setBusy(false);}
  }
  return <article className="product-card">
    <strong>{stepName[item.reviewStep]} · {item.action}</strong>
    <small>Comando {item.commandId} · {item.state}</small>
    <small>Motivo registrado: {item.reason}</small>
    <small>Detectado em {new Date(item.occurredAt).toLocaleString("pt-BR")}</small>
    {item.reviewer?<small>Última revisão: {item.reviewer} · versão {item.reviewVersion}</small>:null}
    <label>Encaminhamento humano
      <select value={decision} onChange={e=>setDecision(e.target.value as "investigating"|"escalated")} disabled={busy}>
        <option value="investigating">Registrar investigação</option>
        <option value="escalated">Escalar para reparação supervisionada</option>
      </select>
    </label>
    <label>Código de justificativa (sem dados pessoais ou segredos)
      <input type="text" value={reasonCode} maxLength={48}
        onChange={e=>setReasonCode(e.target.value)} disabled={busy}/>
    </label>
    <label>Senha corporativa para reautenticação
      <input type="password" value={password} maxLength={128}
        autoComplete="current-password" onChange={e=>setPassword(e.target.value)} disabled={busy}/>
    </label>
    <button type="button" className="button" disabled={busy||!password.trim()||
        !/^[a-z][a-z0-9_]{3,47}$/.test(reasonCode)} onClick={()=>void submit()}>
      Registrar decisão sem alterar a licença
    </button>
    {error?<p role="alert">{error}</p>:null}
  </article>;
}
export function VendeCompensationReviews({productId}:{productId:string}){
  const [data,setData]=useState<ReviewResponse|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function refresh(){
    setBusy(true);setError("");
    try{
      const r=await fetch(
        `/api/billing/products/${encodeURIComponent(productId)}/vende-compensation-reviews`,{cache:"no-store"});
      if(!r.ok)throw Error("unavailable");
      setData(await r.json() as ReviewResponse);
    }catch{setData(null);setError("Revisões de divergências indisponíveis.");}
    finally{setBusy(false);}
  }
  return <section className="card" aria-label="Revisões financeiras supervisionadas">
    <span className="eyebrow">FM Tecnologia · controle humano</span>
    <h2>Revisões de compensação comercial</h2>
    <p>Investigações e escalonamentos são auditados, mas não executam estornos,
      suspensões ou reativações. A situação atual da licença ainda exige
      consulta autenticada ao Assistant e comprovação financeira independente.</p>
    <button className="button" type="button" disabled={busy} onClick={()=>void refresh()}>
      Consultar divergências
    </button>
    {busy?<p role="status">Consultando…</p>:null}
    {error?<p role="status">{error}</p>:null}
    {data?<p role="status">{data.historicalTotal} alerta(s) históricos registrados.
      Nenhum alerta é considerado reparado ou encerrado automaticamente.</p>:null}
    {data?.truncated?<p>Exibindo as 50 divergências mais recentes; histórico total permanece íntegro.</p>:null}
    {data&&!data.items.length?<p>Nenhum alerta de divergência localizado.</p>:null}
    {data?.items.length?<div className="product-grid">{data.items.map(item=>
      <ReviewItem key={item.riskId} item={item} productId={productId} onDone={()=>void refresh()}/>
    )}</div>:null}
  </section>;
}
