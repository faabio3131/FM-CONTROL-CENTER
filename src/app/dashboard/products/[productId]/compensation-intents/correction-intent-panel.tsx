"use client";
import {useState} from "react";
import Link from "next/link";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Result={
  intentId:string;review:string;proposedAction?:string;
  approvedForDispatch?:false;remediationDispatched?:false;caseResolved:false;
  state?:"reactivation_pending";operationId?:string;
  remoteEntitlementConfirmed?:false;financialRefundExecuted?:false;
  automaticDispatchExecuted?:false;
};
type Outcome={
  intentId:string;operationId:string;
  state:"queued"|"processing"|"needs_reconciliation"|
    "delivered_unverified"|"assistant_active_payment_verified";
  remoteEntitlementConfirmed:boolean;
  financialSettlementCurrentlyVerified:boolean;
  coreQuotaVerified:false;caseResolved:boolean;
  commercialCaseClosed?:boolean;closureRecorded?:boolean;
  closureId?:string|null;closureUnitId?:string|null;
  correctionRevision?:number|null;allUnitsVerified?:false;
};
type UnitQuotaProof={
  intentId:string;unitId:string;capability:string;
  state:"core_unit_policy_verified";licenseFreshlyVerified:true;
  coreQuotaVerified:true;
  quotaMetrics:{metric:string;scope:string;limitUnits:number;
    reservedUnits:number;consumedUnits:number;remainingUnits:number}[];
  caseResolved:false;reservationCreated:false;providerCalled:false;
  allUnitsVerified:false;futureAiAdmissionGuaranteed:false;
};
export function VendeCorrectionIntentPanel({productId,initialIntentId=""}:{productId:string;initialIntentId?:string}){
  const [commandId,setCommandId]=useState("");
  const [reviewVersion,setReviewVersion]=useState("1");
  const [intentId,setIntentId]=useState(initialIntentId);
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [result,setResult]=useState<Result|null>(null);
  const [outcome,setOutcome]=useState<Outcome|null>(null);
  const [unitId,setUnitId]=useState("");
  const [capability,setCapability]=useState<"atendimento_interpretacao"|
    "atendimento_transcricao">("atendimento_interpretacao");
  const [coreProof,setCoreProof]=useState<UnitQuotaProof|null>(null);
  const [pendingObservationId,setPendingObservationId]=useState("");
  const [pendingClosureId,setPendingClosureId]=useState("");
  const [history,setHistory]=useState<{
    intentId:string;historicalOnly:true;caseResolved:false;
    truncated:boolean;items:Array<{
      observationId:string;recordedBy:string;recordedAt:string;
      unitId:string;capability:string;contractRevision:number;
      historicalOnly:true;caseResolved:false;
    }>;
  }|null>(null);
  const version=Number(reviewVersion);
  const valid=UUID.test(commandId)&&Number.isSafeInteger(version)&&version>0;
  async function perform(action:"prepare"|"second_review"|"queue"){
    if(!valid||!password.trim()||(action!=="prepare"&&!UUID.test(intentId)))return;
    setBusy(true);setMessage("");setResult(null);setOutcome(null);setCoreProof(null);
    try{
      const response=await fetch(
        `/api/billing/products/${encodeURIComponent(productId)}/vende-compensation-intents`,
        {method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            action,commandId,expectedReviewVersion:version,password,
            ...(action!=="prepare"?{intentId}:{}),
          }),
        },
      );
      if(!response.ok)throw Error("correction_unavailable");
      const data=await response.json() as Result;
      if(data.caseResolved!==false||!UUID.test(data.intentId)||
         (action==="queue"
           ?data.state!=="reactivation_pending"||
            data.remoteEntitlementConfirmed!==false||
            data.automaticDispatchExecuted!==false||
            typeof data.operationId!=="string"
           :data.approvedForDispatch!==false||
            data.remediationDispatched!==false))
        throw Error("invalid_case_response");
      setResult(data);
      if(action==="prepare")setIntentId(data.intentId);
      setMessage(action==="prepare"
        ?"Intenção de correção registrada, aguardando segundo operador corporativo."
        :action==="second_review"
          ?"Segunda revisão registrada. A fila corretiva ainda exige nova autorização explícita."
          :"Reativação registrada na fila canônica. O Assistant ainda não confirmou a licença ativa; não repetir o comando.");
    }catch{
      setMessage("Evidência, permissão, revisão ou validade não confirmada. Nenhuma correção foi realizada.");
    }finally{setPassword("");setBusy(false);}
  }
  async function refreshOutcome(){
    if(!UUID.test(intentId))return;
    setBusy(true);setMessage("");setOutcome(null);setCoreProof(null);
    try{
      const r=await fetch(
        `/api/billing/products/${encodeURIComponent(productId)}/vende-compensation-intents/${encodeURIComponent(intentId)}/status`,
        {cache:"no-store"},
      );
      if(!r.ok)throw Error("status_unavailable");
      const data=await r.json() as Outcome;
      if(data.intentId!==intentId||typeof data.caseResolved!=="boolean"||
         (data.caseResolved&&data.commercialCaseClosed!==true)||
         data.coreQuotaVerified!==false||
         typeof data.remoteEntitlementConfirmed!=="boolean"||
         typeof data.financialSettlementCurrentlyVerified!=="boolean")
        throw Error("invalid_status");
      setOutcome(data);
    }catch{
      setMessage("Confirmação indisponível. Não foi comprovada a reativação; não reenviar o comando.");
    }finally{setBusy(false);}
  }
  async function recordQuotaObservation(){
    if(!coreProof||!password.trim()||!UUID.test(intentId))return;
    setBusy(true);setMessage("");
    const observationId=pendingObservationId||crypto.randomUUID();
    setPendingObservationId(observationId);
    try{
      const res=await fetch(
        `/api/billing/products/${encodeURIComponent(productId)}/vende-compensation-intents/${encodeURIComponent(intentId)}/quota-observations`,
        {method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            observationId,unitId:coreProof.unitId,capability:coreProof.capability,password,
          }),
        },
      );
      if(!res.ok)throw Error("not_recorded");
      const result=await res.json() as {
        observationId:string;status:string;historicalOnly:true;caseResolved:false;
      };
      if(result.observationId!==observationId||
         !["recorded","previously_recorded"].includes(result.status)||
         result.historicalOnly!==true||result.caseResolved!==false)
        throw Error("untrusted_confirmation");
      setMessage("Evidência registrada na auditoria FM para esta unidade. O caso permanece aberto.");
      setPendingObservationId("");
      setCoreProof(null);setHistory(null);
    }catch{
      setMessage("Registro não confirmado; consulte o histórico antes de repetir. Nenhuma licença foi alterada.");
    }finally{setPassword("");setBusy(false);}
  }
  async function loadQuotaHistory(){
    if(!UUID.test(intentId))return;
    setBusy(true);setHistory(null);setMessage("");
    try{
      const res=await fetch(
        `/api/billing/products/${encodeURIComponent(productId)}/vende-compensation-intents/${encodeURIComponent(intentId)}/quota-observations`,
        {cache:"no-store"},
      );
      if(!res.ok)throw Error("history_unavailable");
      const result=await res.json() as NonNullable<typeof history>;
      if(result.intentId!==intentId||result.historicalOnly!==true||
         result.caseResolved!==false||!Array.isArray(result.items)||
         result.items.length>20||result.items.some(x=>
           x.historicalOnly!==true||x.caseResolved!==false))
        throw Error("invalid_history");
      setHistory(result);
    }catch{
      setMessage("Histórico de observações indisponível; não foi presumida verificação atual.");
    }finally{setBusy(false);}
  }
  async function verifyCoreQuota(){
    setPendingObservationId("");
    if(!UUID.test(intentId)||!/^[A-Za-z0-9_.-]{1,128}$/.test(unitId)||
       outcome?.state!=="assistant_active_payment_verified")return;
    setBusy(true);setMessage("");setCoreProof(null);
    try{
      const response=await fetch(
        `/api/billing/products/${encodeURIComponent(productId)}/vende-compensation-intents/${encodeURIComponent(intentId)}/core-quota`,
        {method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({unitId,capability})},
      );
      if(!response.ok)throw Error("core_evidence_unavailable");
      const verified=await response.json() as UnitQuotaProof;
      if(verified.intentId!==intentId||verified.unitId!==unitId||
         verified.capability!==capability||verified.coreQuotaVerified!==true||
         verified.licenseFreshlyVerified!==true||
         verified.state!=="core_unit_policy_verified"||
         verified.caseResolved!==false||verified.reservationCreated!==false||
         verified.providerCalled!==false||verified.allUnitsVerified!==false||
         verified.futureAiAdmissionGuaranteed!==false||
         !Array.isArray(verified.quotaMetrics))
        throw Error("core_evidence_invalid");
      setCoreProof(verified);
    }catch{
      setMessage("Não foi possível certificar a quota atual desta unidade no Core. Nenhum consumo foi realizado.");
    }finally{setBusy(false);}
  }
  async function closeCommercialCase(){
    if(!UUID.test(intentId)||!password.trim()||
       !/^[A-Za-z0-9_.-]{1,128}$/.test(unitId)||
       outcome?.state!=="assistant_active_payment_verified"||
       !Number.isSafeInteger(outcome.correctionRevision)||
       (outcome.correctionRevision??0)<1)return;
    const closureId=pendingClosureId||crypto.randomUUID();
    setPendingClosureId(closureId);setBusy(true);setMessage("");
    try{
      const res=await fetch(
        `/api/billing/products/${encodeURIComponent(productId)}/vende-compensation-intents/${encodeURIComponent(intentId)}/close`,
        {method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({closureId,unitId,
            expectedRevision:outcome.correctionRevision,password})},
      );
      if(!res.ok)throw Error("closure_rejected");
      const proof=await res.json() as {closureId:string;status:string;
        caseResolved:true;commercialCaseClosed:true;allUnitsVerified:false;
        providerRefundExecuted:false;quotaCoverage:string};
      if(proof.closureId!==closureId||proof.caseResolved!==true||
         proof.commercialCaseClosed!==true||proof.allUnitsVerified!==false||
         proof.providerRefundExecuted!==false||
         proof.quotaCoverage!=="one_unit_both_capabilities"||
         !["recorded","previously_recorded"].includes(proof.status))
        throw Error("closure_untrusted");
      setOutcome({...outcome,caseResolved:true,commercialCaseClosed:true,
        closureRecorded:true,closureId,closureUnitId:unitId});
      setPendingClosureId("");
      setMessage("Caso comercial encerrado com revisão humana e auditoria. A leitura de quota cobre somente a unidade informada, sem garantia futura.");
    }catch{
      setMessage("Encerramento não confirmado. Consulte o status antes de repetir; nenhuma cobrança foi alterada.");
    }finally{setPassword("");setBusy(false);}
  }
  return <section className="card" aria-label="Intenções de correção financeiras governadas">
    <span className="eyebrow">FM Tecnologia · dupla revisão de divergências</span>
    <h2>Preparar revisão corretiva</h2>
    <p>Somente para suspensão de inadimplência já entregue quando o pagamento
      foi verificado posteriormente, a licença remota continua suspensa e o
      contrato ainda permite reativação. Exige investigação escalada e evidência
      autenticada recente. Outros casos seguem investigação manual.</p>
    <p><strong>Preparar e revisar não alteram licenças, executam estornos
      ou encerram o caso.</strong> O último comando, quando habilitado pela FM,
      registra uma reativação pendente na fila canônica após confirmação remota
      somente de leitura e reconciliação financeira atualizada. Não envia ao Assistant
      nesta etapa e não confirma acesso ativo.</p>
    <label>Identificador do comando de ciclo comercial
      <input value={commandId} maxLength={36} disabled={busy}
        onChange={e=>{setCommandId(e.target.value);setResult(null);}}/>
    </label>
    <label>Versão atual da revisão escalada
      <input type="number" min="1" max="1000000" value={reviewVersion} disabled={busy}
        onChange={e=>{setReviewVersion(e.target.value);setResult(null);}}/>
    </label>
    <label>ID da intenção (para segundo operador)
      <input value={intentId} maxLength={36} disabled={busy}
        onChange={e=>{setIntentId(e.target.value);setResult(null);
          setCoreProof(null);setHistory(null);setPendingObservationId("");}}/>
    </label>
    <label>Senha corporativa do operador atual
      <input type="password" autoComplete="current-password" maxLength={128}
        value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/>
    </label>
    <div className="form-grid">
      <button className="button" type="button" disabled={busy||!valid||!password.trim()}
        onClick={()=>void perform("prepare")}>
        Preparar intenção — primeiro operador
      </button>
      <button className="button" type="button" disabled={busy||!valid||
        !password.trim()||!UUID.test(intentId)} onClick={()=>void perform("second_review")}>
        Conferir intenção — segundo operador independente
      </button>
      <button className="button" type="button" disabled={busy||!valid||
        !password.trim()||!UUID.test(intentId)} onClick={()=>void perform("queue")}>
        Solicitar entrada na fila corretiva (FM, recurso OFF por padrão)
      </button>
    </div>
    <button className="button" type="button" disabled={busy||!UUID.test(intentId)}
      onClick={()=>void refreshOutcome()}>
      Conferir confirmação remota e pagamento (somente leitura)
    </button>
    {outcome?<div role="status">
      <strong>{outcome.state==="assistant_active_payment_verified"
        ?"Assistant ativo e pagamento verificados novamente"
        :outcome.state==="queued"
          ?"Reativação na fila, ainda sem ACK"
          :outcome.state==="processing"
            ?"Processamento em andamento, sem ACK confirmado"
            :"Estado exige reconciliação; não repetir o envio"}</strong>
      <p>Licença no Assistant verificada agora: {outcome.remoteEntitlementConfirmed?"Sim":"Não"}.
        Pagamento verificado agora: {outcome.financialSettlementCurrentlyVerified?"Sim":"Não"}.
        Core/quotas atuais: consultar por unidade.
        Caso comercial encerrado: {outcome.commercialCaseClosed?"Sim":"Não"}.
        {outcome.closureUnitId?` Unidade registrada: ${outcome.closureUnitId}.`:""}</p>
    </div>:null}
    <fieldset disabled={busy}>
      <legend>Verificação adicional por unidade no FM Core</legend>
      <p>Apenas depois de confirmar Assistant e pagamento. A prova é
        restrita à unidade/capacidade informada, não a todos os clientes.
        Nenhum token é consumido e o caso permanece aberto.</p>
      <label>ID da unidade licenciada
        <input value={unitId} maxLength={128}
          onChange={e=>{setUnitId(e.target.value);setCoreProof(null);
            setPendingObservationId("");}}/>
      </label>
      <label>Capacidade de IA
        <select value={capability}
          onChange={e=>{setCapability(e.target.value as typeof capability);
            setCoreProof(null);setPendingObservationId("");}}>
          <option value="atendimento_interpretacao">Atendimento · texto</option>
          <option value="atendimento_transcricao">Transcrição · áudio</option>
        </select>
      </label>
      <button className="button" type="button" disabled={!UUID.test(intentId)||
        !/^[A-Za-z0-9_.-]{1,128}$/.test(unitId)||
        outcome?.state!=="assistant_active_payment_verified"}
        onClick={()=>void verifyCoreQuota()}>
        Conferir licença e quotas diretamente no Core
      </button>
    </fieldset>
    {coreProof?<section role="status" aria-label="Quotas verificadas nesta unidade">
      <strong>Política de quota autenticada no Core para {coreProof.unitId}</strong>
      {coreProof.quotaMetrics.map(m=><p key={m.metric}>
        {m.metric} ({m.scope}): {m.reservedUnits} reservado(s),
        {" "}{m.consumedUnits} consumido(s),
        {" "}{m.remainingUnits} restante(s) de {m.limitUnits}
      </p>)}
      <p>Sem reserva nova, sem chamada à IA e sem encerramento do caso.
        A próxima solicitação poderá exigir nova verificação de licença e saldo.</p>
      <button className="button" type="button"
        disabled={busy||!password.trim()} onClick={()=>void recordQuotaObservation()}>
        Registrar evidência histórica com reautenticação
      </button>
    </section>:null}
    <button className="button" type="button"
      disabled={busy||!UUID.test(intentId)} onClick={()=>void loadQuotaHistory()}>
      Consultar observações auditadas deste caso
    </button>
    {history?<section aria-label="Histórico da verificação por unidade">
      <p><strong>Somente histórico de verificações anteriores.</strong>
        Não comprova acesso atual, liquidação futura ou encerramento do caso.</p>
      {history.items.length===0?<p>Não há observações registradas.</p>:null}
      {history.items.map(item=><p key={item.observationId}>
        Unidade {item.unitId} · {item.capability} ·
        revisão contratual {item.contractRevision} ·
        registrado por {item.recordedBy} em
        {" "}{new Date(item.recordedAt).toLocaleString("pt-BR")}
      </p>)}
      {history.truncated?<p>Exibidos os 20 registros mais recentes.</p>:null}
    </section>:null}
    <section aria-label="Encerramento supervisionado do caso comercial">
      <h3>Encerramento governado F9</h3>
      <p>Somente após segunda revisão por operador independente, licença ativa,
        pagamento vigente e quotas atuais de texto e áudio na mesma unidade.
        A verificação acontece novamente no servidor. O encerramento refere-se
        ao caso comercial; não certifica todas as unidades, uso futuro de IA,
        estorno ou reembolso. Exige senha do segundo operador.</p>
      <button className="button" type="button"
        disabled={busy||!password.trim()||!UUID.test(intentId)||
          !/^[A-Za-z0-9_.-]{1,128}$/.test(unitId)||
          outcome?.state!=="assistant_active_payment_verified"||
          outcome?.commercialCaseClosed===true||
          !Number.isSafeInteger(outcome?.correctionRevision)}
        onClick={()=>void closeCommercialCase()}>
        Autorizar encerramento comercial (com auditoria)
      </button>
    </section>
    {busy?<p role="status">Validando evidência e estado transacional…</p>:null}
    {message?<p role="status">{message}</p>:null}
    {result?<div role="status">
      <p>Intenção: <code>{result.intentId}</code></p>
      <p>Etapa: {result.review==="awaiting_independent_human_review"
        ?"Aguardando segunda revisão":result.review==="reviewed_no_dispatch"
          ?"Revisão independente registrada; despacho proibido":"Estado desconhecido"}</p>
      <p>{result.state==="reactivation_pending"
        ?"Contrato em reativação pendente, aguardando ACK assinado do Assistant."
        :"Proposta controlada: "+(result.proposedAction??"Somente revisão humana")+
          ". Nenhum contrato ou pagamento foi alterado."}</p>
    </div>:null}
    <Link className="button" href={`/dashboard/products/${productId}/assistant-plans`}>
      Voltar à investigação FM
    </Link>
  </section>;
}
