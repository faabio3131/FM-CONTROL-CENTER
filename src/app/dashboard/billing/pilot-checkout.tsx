"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

type Pilot = { product:string; value:string; invoiceStatus:string; gatewayReady:boolean; existingPayment:boolean; paymentId:string|null; paymentStatus:string|null; canCreatePayment:boolean };
type Pix = {encodedImage:string; payload:string};

function EyeIcon({hidden}:{hidden:boolean}) {
 return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
  {hidden?<><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 4.2A10.7 10.7 0 0112 4c5.5 0 9 8 9 8a18 18 0 01-2.1 3.2"/><path d="M6.2 6.2C3.8 8 3 12 3 12s3.5 8 9 8a9.8 9.8 0 004.2-.9"/></>:<><path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="2.7"/></>}
 </svg>;
}

export function PilotCheckout() {
 const [pilot,setPilot]=useState<Pilot|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [showPassword,setShowPassword]=useState(false);
 const [buyer,setBuyer]=useState({name:"",cpfCnpj:"",email:"",password:""});
 const [payment,setPayment]=useState<{paymentId:string;pix:Pix|null;status:string}|null>(null);

 const refresh=async()=> {
  const response=await fetch("/api/billing/checkout/pilot",{credentials:"same-origin",cache:"no-store"});
  if(!response.ok)throw new Error("Fatura indisponível para a organização atual.");
  setPilot(await response.json() as Pilot);
 };

 useEffect(() => {
  let active = true;
  fetch("/api/billing/checkout/pilot", { credentials: "same-origin", cache: "no-store" })
   .then(async response => {
    if (!response.ok) throw new Error("Fatura indisponível.");
    return response.json() as Promise<Pilot>;
   })
   .then(data => { if (active) setPilot(data); })
   .catch(() => { if (active) setError("Não foi possível verificar o checkout da organização ativa."); });
  return () => { active = false; };
 }, []);

 const submit=async(kind:"issue"|"reconcile"|"recover")=>{
  setBusy(true);setError("");
  try {
   const body=kind==="issue"?{...buyer,authorization:"AUTHORIZE_REAL_PIX_BRL_1_00"}:{password:buyer.password};
   const response=await fetch("/api/billing/checkout/pilot/"+kind,{method:"POST",
    credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const json=await response.json() as {error?:string;paymentId?:string;pix?:Pix|null;status?:string};
   if(!response.ok)throw new Error(json.error||"Falha na operação.");
   if(!json.paymentId||!json.status)throw new Error("Resposta de pagamento incompleta.");
   setPayment({paymentId:json.paymentId,pix:json.pix??null,status:json.status});
   await refresh();
  } catch(e){setError(e instanceof Error?e.message:"Falha inesperada.");}
  finally{setBusy(false);}
 };

 const recoveryRequired=pilot?.invoiceStatus==="creating"&&!pilot.paymentId;

 return <section className="panel" aria-label="Compra de teste Kordena">
  <h2>Compra de teste — Kordena</h2>
  <p>Fluxo de homologação protegido para a conta Asaas da FM Tecnologia.</p>
  {error&&<p role="alert">{error}</p>}
  {!pilot&&<p>Verificando fatura e permissões...</p>}
  {pilot&&<><p><strong>{pilot.product} — R$ {pilot.value.replace(".",",")}</strong></p>
   <p>Pagamento: Pix · Fatura: {pilot.invoiceStatus} · Gateway: {pilot.gatewayReady?"Ativo":"Desabilitado"}</p>
   {pilot.paymentId&&<p>Pagamento já registrado: {pilot.paymentId} · {pilot.paymentStatus}. Uma segunda cobrança está bloqueada.</p>}
   {recoveryRequired&&<div role="alert">
    <p><strong>Recuperação administrativa necessária.</strong></p>
    <p>Existe uma emissão anterior sem confirmação local. Não gere um novo Pix antes da recuperação segura.</p>
   </div>}
   <form onSubmit={e=>{e.preventDefault();void submit("issue");}}>
    <label>Nome do comprador<input value={buyer.name} onChange={e=>setBuyer(v=>({...v,name:e.target.value}))} required minLength={3} autoComplete="name"/></label>
    <label>CPF ou CNPJ<input value={buyer.cpfCnpj} onChange={e=>setBuyer(v=>({...v,cpfCnpj:e.target.value}))} required inputMode="numeric" autoComplete="off"/></label>
    <label>E-mail<input type="email" value={buyer.email} onChange={e=>setBuyer(v=>({...v,email:e.target.value}))} autoComplete="email"/></label>
    <label>
     Senha de confirmação administrativa
     <span style={{display:"flex",alignItems:"center",gap:8}}>
      <input
       type={showPassword?"text":"password"}
       value={buyer.password}
       onChange={e=>setBuyer(v=>({...v,password:e.target.value}))}
       required
       minLength={8}
       maxLength={128}
       autoComplete="current-password"
       aria-describedby="billing-password-help"
       style={{flex:1}}
      />
      <button
       type="button"
       aria-label={showPassword?"Ocultar senha":"Mostrar senha"}
       aria-pressed={showPassword}
       title={showPassword?"Ocultar senha":"Mostrar senha"}
       onClick={()=>setShowPassword(value=>!value)}
      ><EyeIcon hidden={showPassword}/></button>
     </span>
    </label>
    <small id="billing-password-help">
     Senha da sua conta atual. O FM Command aceita senhas de 8 a 128 caracteres. Não é obrigatório usar maiúscula, número ou símbolo, mas recomendamos combinar letras, números e símbolos e evitar senhas reutilizadas.
    </small>
    {recoveryRequired&&<div>
     <button
      className="button primary"
      type="button"
      disabled={busy||buyer.password.length<8}
      onClick={()=>void submit("recover")}
     >{busy?"Recuperando…":"Recuperar cobrança"}</button>
     <p>Esta ação faz somente consultas de recuperação no Asaas e não cria uma nova cobrança.</p>
    </div>}
    <button className="button primary" type="submit" disabled={busy||!pilot.canCreatePayment||pilot.existingPayment||pilot.invoiceStatus!=="pending"}>Gerar Pix de R$ 1,00</button>
   </form>
   <p>Emissão protegida: esta tela só libera o botão após autorização operacional de produção.</p>
   {payment&&<div role="status">
    <p>Pagamento: {payment.paymentId} · Situação: {payment.status}</p>
    {payment.pix&&<><Image alt="QR Code Pix do pagamento" width={240} height={240} unoptimized src={"data:image/png;base64,"+payment.pix.encodedImage}/>
    <label>Pix Copia e Cola<textarea readOnly value={payment.pix.payload} rows={4}/></label></>}
   </div>}
   <button type="button" disabled={busy||!payment} onClick={()=>void submit("reconcile")}>Consultar pagamento</button>
  </>}
 </section>;
}
