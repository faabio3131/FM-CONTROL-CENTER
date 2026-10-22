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
  coreQuotaVerified:false;caseResolved:false;
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
export function VendeCorrectionIntentPanel({productId}:{productId:string}){
  const [commandId,setCommandId]=useState("");
  const [reviewVersion,setReviewVersion]=useState("1");
  const [intentId,setIntentId]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [result,setResult]=useState<Result|null>(null);
  const [outcome,setOutcome]=useState<Outcome|null>(null);
  const [unitId,setUnitId]=useState("");
  const [capability,setCapability]=useState<"atendimento_interpretacao"|
    "atendimento_transcricao">("atendimento_interpretacao");
  const [coreProof,setCoreProof]=useState<UnitQuotaProof|null>(null);
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
      if(data.intentId!==intentId||data.caseResolved!==false||
         data.coreQuotaVerified!==false||
         typeof data.remoteEntitlementConfirmed!=="boolean"||
         typeof data.financialSettlementCurrentlyVerified!=="boolean")
        throw Error("invalid_status");
      setOutcome(data);
    }catch{
      setMessage("Confirmação indisponível. Não foi comprovada a reativação; não reenviar o comando.");
    }finally{setBusy(false);}
  }
  async function verifyCoreQuota(){
    if(!UUID.test(intentId)||!/^[A-Za-z0-9_.-]{1,128}$/.test(unitId)||
       outcome?.state!=="assistant_active_payment_verified")return;
    setBusy(true);setMessage("");setCoreProof(null);
    try{
      const response=await fetch(
        \`/api/billing/products/\${encodeURIComponent(productId)}/vende-compensation-intents/\${encodeURIComponent(intentId)}/core-quota\`,
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
        onChange={e=>{setIntentId(e.target.value);setResult(null);}}/>
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
        Core/quotas verificados: Não. Caso encerrado: Não.</p>
    </div>:null}
    <fieldset disabled={busy}>
      <legend>Verificação adicional por unidade no FM Core</legend>
      <p>Apenas depois de confirmar Assistant e pagamento. A prova é
        restrita à unidade/capacidade informada, não a todos os clientes.
        Nenhum token é consumido e o caso permanece aberto.</p>
      <label>ID da unidade licenciada
        <input value={unitId} maxLength={128}
          onChange={e=>{setUnitId(e.target.value);setCoreProof(null);}}/>
      </label>
      <label>Capacidade de IA
        <select value={capability}
          onChange={e=>{setCapability(e.target.value as typeof capability);
            setCoreProof(null);}}>
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
    </section>:null}
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
