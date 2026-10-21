"use client";

import { useEffect, useState } from "react";

type QRPolicy={displaySeconds:number;revision:number;source:string};
export function WhatsAppQRPolicyEditor({productId}:{productId:string}){
  const [policy,setPolicy]=useState<QRPolicy|null>(null);
  const [seconds,setSeconds]=useState("45");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState("");
  const path=`/api/billing/products/${productId}/whatsapp-qr-policy`;
  useEffect(()=>{
    let active=true;
    void fetch(path,{cache:"no-store"}).then(async r=>{
      if(!r.ok)throw new Error("Não foi possível carregar a política.");
      return r.json() as Promise<QRPolicy>;
    }).then(value=>{
      if(active){setPolicy(value);setSeconds(String(value.displaySeconds));}
    }).catch(()=>{if(active)setFeedback("Configuração indisponível.");});
    return()=>{active=false;};
  },[path]);
  async function save(){
    if(!policy||!password){setFeedback("Confirme sua senha da FM.");return;}
    const value=Number(seconds);
    if(!Number.isSafeInteger(value)||value<15||value>120){
      setFeedback("Informe um valor entre 15 e 120 segundos.");return;
    }
    setBusy(true);setFeedback("");
    try{
      const response=await fetch(path,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({password,displaySeconds:value,expectedRevision:policy.revision}),
      });
      const result=await response.json() as QRPolicy&{error?:string};
      if(!response.ok)throw new Error(result.error??"Alteração recusada.");
      setPolicy(result);setPassword("");
      setFeedback("Política corporativa salva. Publicação no Assistant exige projeção autenticada.");
    }catch(e){setFeedback(e instanceof Error?e.message:"Alteração recusada.");}
    finally{setBusy(false);}
  }
  async function syncAssistant(){
    if(!policy || policy.revision<1 || !password){
      setFeedback("Salve uma política e confirme sua senha da FM.");return;
    }
    setBusy(true);setFeedback("");
    try{
      const response=await fetch(path+"/sync",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({password}),
      });
      const result=await response.json() as {status?:string;revision?:number;error?:string};
      if(!response.ok || !["projected","already_projected"].includes(result.status??"") ||
          result.revision!==policy.revision)
        throw new Error("Sincronização não confirmada. Verifique a integração FM.");
      setPassword("");
      setFeedback("Assistant confirmou a revisão "+result.revision+" da política do QR Code.");
    }catch(e){setFeedback(e instanceof Error?e.message:"Sincronização não confirmada.");}
    finally{setBusy(false);}
  }
  return <section className="card" aria-label="Validade do QR Code WhatsApp">
    <span className="eyebrow">Integrações · FM Tecnologia</span>
    <h2>Validade máxima do QR Code WhatsApp</h2>
    <p>Padrão: <strong>45 segundos</strong>. A FM controla o limite visual;
      a validade real do WhatsApp/Evolution sempre prevalece quando for menor.</p>
    <div className="form-grid">
      <label>Tempo máximo de exibição (segundos)
        <input type="number" min="15" max="120" step="1"
          value={seconds} onChange={e=>setSeconds(e.target.value)}/>
      </label>
      <label>Confirme sua senha da FM
        <input type="password" autoComplete="current-password"
          value={password} onChange={e=>setPassword(e.target.value)}/>
      </label>
    </div>
    <p>Revisão: {policy?.revision??"carregando"} · Alteração exclusiva da FM.</p>
    <button type="button" disabled={busy||!policy} onClick={()=>void save()}>
      {busy?"Salvando…":"Salvar política do QR Code"}
    </button>
    <button type="button" disabled={busy||!policy||policy.revision<1}
      onClick={()=>void syncAssistant()}>
      Sincronizar revisão com o Assistant
    </button>
    <p>A sincronização é autenticada, auditada e desativada por padrão até liberação operacional da FM.
      Uma falha não significa que a revisão foi aplicada remotamente.</p>
    <p role="status" aria-live="polite">{feedback}</p>
  </section>;
}
