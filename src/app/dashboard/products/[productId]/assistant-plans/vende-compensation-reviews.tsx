"use client";
import {useState} from "react";
import Link from "next/link";
import {describeVendeCompensationObservation,type VendeEvidenceView}
  from "@/domain/billing/vende-compensation-observation-view";
type ReviewStep="unreviewed"|"investigating"|"escalated";
type Case={
  riskId:string;commandId:string;action:string;state:string;reason:string;
  occurredAt:string;reviewVersion:number;reviewStep:ReviewStep;
  reviewer:string|null;reviewedAt:string|null;
  followup:{
    nextAction:"initial_review_required"|"refresh_current_evidence"|
      "correction_preparation_required"|"independent_review_required"|
      "queue_authorization_required"|"correction_queued"|
      "correction_processing"|"manual_reconciliation_required"|
      "remote_readback_required"|"closure_recorded_verify_current"|
      "other_risk_investigation";
    intentId:string|null;currentEntitlementVerified:false;
    financialRepairExecuted:false;caseResolved:false;
    automaticRemediationAuthorized:false;
    historicalClosure:{
      closureId:string;unitId:string;recordedAt:string;
      historicalOnly:true;currentLicenseVerified:false;
      currentPaymentVerified:false;currentCoreQuotaVerified:false;
      caseResolved:false;
    }|null;
  };
};
type ReviewResponse={
  historicalTotal:number;truncated:boolean;nextCursor:string|null;items:Case[];
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
const nextActionName:Record<Case["followup"]["nextAction"],string>={
  initial_review_required:"Próximo passo: primeira revisão corporativa",
  refresh_current_evidence:"Próximo passo: consultar evidência atual antes da decisão",
  correction_preparation_required:"Próximo passo: preparar intenção corretiva com duas pessoas",
  independent_review_required:"Próximo passo: revisão independente da intenção",
  queue_authorization_required:"Próximo passo: autorização humana para enfileirar",
  correction_queued:"Correção na fila; aguardar processamento e ACK",
  correction_processing:"Correção em processamento; não reenviar",
  manual_reconciliation_required:"Divergência na correção; conciliar antes de agir",
  remote_readback_required:"Correção entregue; conferir licença, pagamento e Core",
  closure_recorded_verify_current:"Fechamento comercial registrado; conferir novamente a situação atual",
  other_risk_investigation:"Próximo passo: investigação financeira específica",
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
    {item.followup?.caseResolved===false&&
      item.followup.currentEntitlementVerified===false&&
      item.followup.financialRepairExecuted===false&&
      item.followup.automaticRemediationAuthorized===false?
      <p role="status"><strong>{nextActionName[item.followup.nextAction]}</strong>
        {item.followup.intentId?<span>
          {" "}· Intenção vinculada: <code>{item.followup.intentId}</code>
        </span>:null}
        <small> Estado operacional histórico; não confirma licença, pagamento ou quotas atuais.</small>
      </p>:<p role="alert">Encaminhamento não comprovado; investigação manual.</p>}
    {item.followup?.historicalClosure?
      <p role="status">
        <strong>Encerramento comercial auditado (histórico)</strong>
        {" "}em {new Date(item.followup.historicalClosure.recordedAt).toLocaleString("pt-BR")}
        {" "}· Unidade {item.followup.historicalClosure.unitId}.
        Este registro não confirma o estado atual da licença, do pagamento ou das quotas.
      </p>:null}
    {item.followup?.intentId?
      <p><Link className="button" href={`/dashboard/products/${encodeURIComponent(productId)}/compensation-intents?intentId=${encodeURIComponent(item.followup.intentId)}`}>
        Conferir situação atual desta intenção
      </Link></p>:null}
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
  const [currentCursor,setCurrentCursor]=useState<string|null>(null);
  const [previousCursors,setPreviousCursors]=useState<Array<string|null>>([]);
  async function refresh(after:string|null=null,history:Array<string|null>=[]){
    setBusy(true);setError("");
    try{
      const uri=`/api/billing/products/${encodeURIComponent(productId)}/vende-compensation-reviews`+
        (after?`?after=${encodeURIComponent(after)}`:"");
      const r=await fetch(uri,{cache:"no-store"});
      if(!r.ok)throw Error("unavailable");
      const result=await r.json() as ReviewResponse;
      if(!result||!Array.isArray(result.items)||result.items.length>50||
        result.items.some(item=>{
          const closure=item.followup?.historicalClosure;
          return closure!==null&&closure!==undefined&&(
            !/^[0-9a-f-]{36}$/i.test(closure.closureId)||
            !/^[A-Za-z0-9_.-]{1,128}$/.test(closure.unitId)||
            closure.historicalOnly!==true||
            closure.currentLicenseVerified!==false||
            closure.currentPaymentVerified!==false||
            closure.currentCoreQuotaVerified!==false||
            closure.caseResolved!==false);
        })||
        !Number.isSafeInteger(result.historicalTotal)||result.historicalTotal<0||
        typeof result.truncated!=="boolean"||
        !(result.nextCursor===null||
          typeof result.nextCursor==="string"&&result.nextCursor.length<=128)||
        result.truncated!==(result.nextCursor!==null)||
        result.truncated&&result.items.length!==50)
        throw Error("invalid_pagination");
      setData(result);setCurrentCursor(after);setPreviousCursors(history);
    }catch{setError("Consulta indisponivel; pagina anterior preservada.");}
    finally{setBusy(false);}
  }
  return <section className="card" aria-label="Revisões financeiras supervisionadas">
    <span className="eyebrow">FM Tecnologia IA · controle humano</span>
    <h2>Revisões de compensação comercial</h2>
    <p>Investigações e escalonamentos são auditados. Após abrir uma investigação, a FM
      pode consultar uma evidência autenticada do estado remoto e do registro financeiro
      vigente. Isso não executa estorno, suspensão, reativação ou reparação automática.</p>
    <p><Link className="button" href={`/dashboard/products/${productId}/compensation-intents`}>
      Revisão corretiva com dois operadores (sem executar reparo)
    </Link></p>
    <button className="button" type="button" disabled={busy} onClick={()=>void refresh()}>
      Consultar divergências
    </button>
    {busy?<p role="status">Consultando…</p>:null}
    {error?<p role="status">{error}</p>:null}
    {data?<p role="status">{data.historicalTotal} alerta(s) históricos registrados.
      Nenhum alerta é considerado reparado ou encerrado automaticamente.</p>:null}
    {data?<nav aria-label="Paginas de divergencias comerciais">
      <span>Pagina {previousCursors.length+1} - {data.items.length} registro(s) exibidos.</span>{" "}
      <button className="button" type="button"
        disabled={busy||previousCursors.length===0}
        onClick={()=>void refresh(previousCursors.at(-1)??null,previousCursors.slice(0,-1))}>
        Pagina anterior
      </button>{" "}
      <button className="button" type="button" disabled={busy||!data.nextCursor}
        onClick={()=>void refresh(data.nextCursor,[...previousCursors,currentCursor])}>
        Proxima pagina
      </button>
    </nav>:null}
    {data&&!data.items.length?<p>Nenhum alerta de divergência localizado.</p>:null}
    {data?.items.length?<div className="product-grid">{data.items.map(item=>
      <ReviewItem key={item.riskId} item={item} productId={productId} onDone={()=>void refresh()}/>
    )}</div>:null}
  </section>;
}
