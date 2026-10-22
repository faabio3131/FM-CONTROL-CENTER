"use client";
import {useState} from "react";
import {describeVendeCompensationObservation,type VendeEvidenceView}
  from "@/domain/billing/vende-compensation-observation-view";
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
type HistoricalObservation={
  state:string;financeState:string;invoiceState:string;reviewVersion:number|null;
  observedAt:string;historicalOnly:true;currentLicenseVerified:false;
  remediationConfirmed:false;
};
type HistoryResponse={
  items:HistoricalObservation[];truncated:boolean;historicalOnly:true;
  currentLicenseVerified:false;currentFinanceVerified:false;
  remediationConfirmed:false;caseResolved:false;
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
  const [observation,setObservation]=useState<VendeEvidenceView|null>(null);
  const [history,setHistory]=useState<HistoryResponse|null>(null);
  async function refreshEvidence(){
    setBusy(true);setError("");setObservation(null);
    try{
      const r=await fetch(`/api/billing/products/${encodeURIComponent(productId)}/vende-compensation-evidence`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({commandId:item.commandId,expectedReviewVersion:item.reviewVersion,password}),
      });
      if(!r.ok)throw Error("unavailable");
      const view=describeVendeCompensationObservation(await r.json() as unknown);
      if(!view)throw Error("invalid_observation");
      setObservation(view);
      setPassword("");
    }catch{setPassword("");setError("A verificação de evidências não foi concluída. Nenhuma mudança foi realizada.");}
    finally{setBusy(false);}
  }
  async function loadHistory(){
    setBusy(true);setError("");
    try{
      const r=await fetch(`/api/billing/products/${encodeURIComponent(productId)}/vende-compensation-evidence/${encodeURIComponent(item.commandId)}/history`,{cache:"no-store"});
      if(!r.ok)throw Error("history_unavailable");
      const result=await r.json() as HistoryResponse;
      if(result.historicalOnly!==true||result.currentLicenseVerified!==false||
         result.currentFinanceVerified!==false||result.remediationConfirmed!==false||
         result.caseResolved!==false||!Array.isArray(result.items))
        throw Error("history_invalid");
      setHistory(result);
    }catch{
      setHistory(null);setError("Histórico indisponível. Nenhuma mudança foi realizada.");
    }finally{setBusy(false);}
  }
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
    {item.reviewVersion>0?<button type="button" className="button"
      disabled={busy||!password.trim()} onClick={()=>void refreshEvidence()}>
      Consultar evidências atuais sem alterar licença
    </button>:null}
    <button className="button" type="button" disabled={busy}
      onClick={()=>void loadHistory()}>
      Consultar histórico de evidências registradas
    </button>
    {history?<section aria-label="Histórico das observações financeiras">
      <p><strong>Somente histórico auditado.</strong> Estes registros não comprovam a licença,
        o pagamento atual nem autorizam reparação. O caso não foi encerrado.</p>
      {history.items.length===0?<p>Não há observações registradas para esta divergência.</p>:null}
      {history.items.map((entry,index)=>{
        const view=describeVendeCompensationObservation({
          ...entry,remoteObserved:true,remediationDispatched:false,
          automaticCompensationAuthorized:false,caseResolved:false,
        });
        return <p key={index}>
          <strong>{view?.heading??"Observação histórica sem classificação reconhecida"}</strong>
          {" · "}{new Date(entry.observedAt).toLocaleString("pt-BR")}
          {view?` · ${view.financeLabel} · ${view.invoiceLabel}`:""}
          {entry.reviewVersion?` · Revisão ${entry.reviewVersion}`:""}
        </p>;
      })}
      {history.truncated?<p>Exibidos apenas os dez registros históricos mais recentes.</p>:null}
    </section>:null}
    {observation?<div role="status" aria-live="polite">
      <strong>{observation.heading}</strong>
      <p>Financeiro: {observation.financeLabel}. Fatura: {observation.invoiceLabel}.</p>
      <p>{observation.notice}</p>
      {observation.level==="critical"?<p>Prioridade: revisão financeira urgente.</p>:null}
    </div>:null}
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
    <p>Investigações e escalonamentos são auditados. Após abrir uma investigação, a FM
      pode consultar uma evidência autenticada do estado remoto e do registro financeiro
      vigente. Isso não executa estorno, suspensão, reativação ou reparação automática.</p>
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
