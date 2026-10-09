"use client";
import { useEffect, useState } from "react";

type Pilot = { product:string; value:string; invoiceStatus:string; gatewayReady:boolean; existingPayment:boolean; canCreatePayment:boolean };
type Pix = {encodedImage:string; payload:string};
export function PilotCheckout() {
 const [pilot,setPilot]=useState<Pilot|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [buyer,setBuyer]=useState({name:"",cpfCnpj:"",email:"",password:""});
 const [payment,setPayment]=useState<{paymentId:string;pix:Pix|null;status:string}|null>(null);
 const refresh=async()=> {
  const response=await fetch("/api/billing/checkout/pilot",{credentials:"same-origin",cache:"no-store"});
  if(!response.ok)throw new Error("Fatura indisponível para a organização atual.");
  setPilot(await response.json() as Pilot);
 };
 useEffect(()=>{void refresh().catch(()=>setError("Não foi possível verificar o checkout da organização ativa."));},[]);
 const submit=async(kind:"issue"|"reconcile")=>{
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
 return <section className="panel" aria-label="Compra de teste Kordena">
  <h2>Compra de teste — Kordena</h2>
  <p>Fluxo de homologação protegido para a conta Asaas da FM Tecnologia.</p>
  {error&&<p role="alert">{error}</p>}
  {!pilot&&<p>Verificando fatura e permissões...</p>}
  {pilot&&<><p><strong>{pilot.product} — R$ {pilot.value.replace(".",",")}</strong></p>
   <p>Pagamento: Pix · Fatura: {pilot.invoiceStatus} · Gateway: {pilot.gatewayReady?"Ativo":"Desabilitado"}</p>
   <form onSubmit={e=>{e.preventDefault();void submit("issue");}}>
    <label>Nome do comprador<input value={buyer.name} onChange={e=>setBuyer(v=>({...v,name:e.target.value}))} required minLength={3} autoComplete="name"/></label>
    <label>CPF ou CNPJ<input value={buyer.cpfCnpj} onChange={e=>setBuyer(v=>({...v,cpfCnpj:e.target.value}))} required inputMode="numeric" autoComplete="off"/></label>
    <label>E-mail<input type="email" value={buyer.email} onChange={e=>setBuyer(v=>({...v,email:e.target.value}))} autoComplete="email"/></label>
    <label>Senha de confirmação administrativa<input type="password" value={buyer.password} onChange={e=>setBuyer(v=>({...v,password:e.target.value}))} required autoComplete="current-password"/></label>
    <button className="button primary" type="submit" disabled={busy||!pilot.canCreatePayment||pilot.existingPayment||pilot.invoiceStatus!=="pending"}>Gerar Pix de R$ 1,00</button>
   </form>
   <p>Emissão protegida: esta tela só libera o botão após autorização operacional de produção.</p>
   {payment&&<div role="status">
    <p>Pagamento: {payment.paymentId} · Situação: {payment.status}</p>
    {payment.pix&&<><img alt="QR Code Pix do pagamento" width={240} height={240} src={"data:image/png;base64,"+payment.pix.encodedImage}/>
    <label>Pix Copia e Cola<textarea readOnly value={payment.pix.payload} rows={4}/></label></>}
   </div>}
   <button type="button" disabled={busy||!payment} onClick={()=>void submit("reconcile")}>Consultar pagamento</button>
  </>}
 </section>;
}
