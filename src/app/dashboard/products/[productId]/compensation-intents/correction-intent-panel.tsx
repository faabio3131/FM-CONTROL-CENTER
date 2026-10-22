"use client";
import {useState} from "react";
import Link from "next/link";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Result={
  intentId:string;review:string;proposedAction?:string;
  approvedForDispatch:false;remediationDispatched:false;caseResolved:false;
};
export function VendeCorrectionIntentPanel({productId}:{productId:string}){
  const [commandId,setCommandId]=useState("");
  const [reviewVersion,setReviewVersion]=useState("1");
  const [intentId,setIntentId]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [result,setResult]=useState<Result|null>(null);
  const version=Number(reviewVersion);
  const valid=UUID.test(commandId)&&Number.isSafeInteger(version)&&version>0;
  async function perform(action:"prepare"|"second_review"){
    if(!valid||!password.trim()||(action==="second_review"&&!UUID.test(intentId)))return;
    setBusy(true);setMessage("");setResult(null);
    try{
      const response=await fetch(
        `/api/billing/products/${encodeURIComponent(productId)}/vende-compensation-intents`,
        {method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            action,commandId,expectedReviewVersion:version,password,
            ...(action==="second_review"?{intentId}:{}),
          }),
        },
      );
      if(!response.ok)throw Error("correction_unavailable");
      const data=await response.json() as Result;
      if(data.approvedForDispatch!==false||
         data.remediationDispatched!==false||data.caseResolved!==false||
         !UUID.test(data.intentId))throw Error("invalid_case_response");
      setResult(data);
      if(action==="prepare")setIntentId(data.intentId);
      setMessage(action==="prepare"
        ?"Intenção de correção registrada, aguardando segundo operador corporativo."
        :"Segunda revisão registrada. Nenhuma correção foi executada ou autorizada para disparo.");
    }catch{
      setMessage("Evidência, permissão, revisão ou validade não confirmada. Nenhuma correção foi realizada.");
    }finally{setPassword("");setBusy(false);}
  }
  return <section className="card" aria-label="Intenções de correção financeiras governadas">
    <span className="eyebrow">FM Tecnologia · dupla revisão de divergências</span>
    <h2>Preparar revisão corretiva</h2>
    <p>Somente para suspensão de inadimplência já entregue quando o pagamento
      foi verificado posteriormente, a licença remota continua suspensa e o
      contrato ainda permite reativação. Exige investigação escalada e evidência
      autenticada recente. Outros casos seguem investigação manual.</p>
    <p><strong>Esta interface não corrige licenças, não executa estornos,
      não aprova dispatch e não encerra o caso.</strong> O envio transacional
      definitivo exige outro mecanismo com provas atuais independentes.</p>
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
    </div>
    {busy?<p role="status">Validando evidência e estado transacional…</p>:null}
    {message?<p role="status">{message}</p>:null}
    {result?<div role="status">
      <p>Intenção: <code>{result.intentId}</code></p>
      <p>Etapa: {result.review==="awaiting_independent_human_review"
        ?"Aguardando segunda revisão":result.review==="reviewed_no_dispatch"
          ?"Revisão independente registrada; despacho proibido":"Estado desconhecido"}</p>
      <p>Proposta controlada: {result.proposedAction??"Somente revisão humana"}.
        Nenhum contrato ou pagamento foi alterado.</p>
    </div>:null}
    <Link className="button" href={`/dashboard/products/${productId}/assistant-plans`}>
      Voltar à investigação FM
    </Link>
  </section>;
}
