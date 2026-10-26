"use client";

import { useState } from "react";

type View={
  invoiceId:string;amountMinor:number;currency:string;externalPaymentRef:string;
  binding:{providerCustomerRef:string;sourceRef:string;createdAt:string}|null;
  attempts:{observationId:string;state:string;reason:string|null;startedAt:string;finishedAt:string|null}[];
  truncated:boolean;readbackEnabled:boolean;
};
const labels:Record<string,string>={processing:"Em processamento",recorded:"Observação registrada",needs_attention:"Requer atenção"};

export function VendePaymentReadbackSupervisor({productId}:{productId:string}){
  const [invoiceId,setInvoiceId]=useState("");const [data,setData]=useState<View|null>(null);
  const [payer,setPayer]=useState("");const [source,setSource]=useState("");
  const [password,setPassword]=useState("");const [observationId,setObservationId]=useState("");
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const endpoint=`/api/billing/products/${encodeURIComponent(productId)}/payment-readback`;
  async function load(id:string){
    const r=await fetch(endpoint+"?invoiceId="+encodeURIComponent(id),{cache:"no-store"});
    if(!r.ok)throw Error("unavailable");
    const next=await r.json() as View;setData(next);return next;
  }
  async function lookup(){
    setBusy(true);setMessage("");setData(null);
    try{await load(invoiceId);setMessage("Fatura localizada. Nenhuma consulta externa foi realizada.");}
    catch{setMessage("Fatura indisponível. Confira o identificador, o produto e sua permissão FM.");}
    finally{setBusy(false);}
  }
  async function submit(action:"bind"|"observe"|"quarantine"){
    if(!data||!password.trim())return;
    setBusy(true);setMessage("");
    try{
      const r=await fetch(endpoint,{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,password,invoiceId:data.invoiceId,
          ...(action==="bind"?{providerCustomerRef:payer,sourceRef:source}:action==="observe"?{observationId}:{})})});
      if(!r.ok)throw Error("denied");
      const body=await r.json() as {result:{state?:string;replayed?:boolean;quarantined?:number}};
      setMessage(action==="bind"?"Associação do pagador registrada.":action==="quarantine"
        ?`${body.result.quarantined??0} tentativa(s) antiga(s) isolada(s). Nenhum reenvio realizado.`
        :`${labels[body.result.state??""]??"Consulte o histórico"}.${body.result.replayed?" Solicitação repetida: sem nova consulta.":""} O estado financeiro e a licença não foram alterados.`);
      try{await load(data.invoiceId);}catch{setData(null);setMessage("Operação registrada, mas o painel não pôde ser atualizado. Consulte a fatura novamente.");}
    }catch{
      setMessage("Não foi possível confirmar a operação. Consulte o histórico antes de prosseguir; para a mesma consulta, preserve o identificador da observação.");
    }finally{setPassword("");setBusy(false);}
  }
  return <section className="card" aria-label="Verificação de pagamentos VendeAtendeIA">
    <span className="eyebrow">FM Tecnologia IA · conciliação</span>
    <h2>Verificação de pagamentos</h2>
    <p>Consulte a fatura registrada no Command e revise a associação do pagador.
      Uma observação registrada não confirma quitação nem altera a licença do cliente.</p>
    <label>Identificador da fatura
      <input value={invoiceId} maxLength={36} disabled={busy} onChange={e=>{setInvoiceId(e.target.value);setData(null);setObservationId("");}}/>
    </label>
    <button type="button" className="button" disabled={busy||!invoiceId} onClick={()=>void lookup()}>Consultar fatura</button>
    {busy?<p role="status">Processando solicitação…</p>:null}
    {message?<p role="status">{message}</p>:null}
    {data?<>
      <p>Valor: {new Intl.NumberFormat("pt-BR",{style:"currency",currency:data.currency}).format(data.amountMinor/100)} · Pagamento: {data.externalPaymentRef}</p>
      <p>Consulta ao gateway: {data.readbackEnabled?"habilitada pela FM":"desativada por configuração"}.</p>
      {data.binding?<p>Pagador associado: {data.binding.providerCustomerRef} · Fonte revisada: {data.binding.sourceRef}.</p>:<>
        <p>Revise os dados antes de associar. A associação é imutável para esta fatura.</p>
        <label>Identificador do pagador no gateway<input value={payer} maxLength={132} disabled={busy} onChange={e=>setPayer(e.target.value)}/></label>
        <label>Referência da revisão FM<input value={source} maxLength={128} disabled={busy} onChange={e=>setSource(e.target.value)}/></label>
      </>}
      <label>Senha da conta corporativa FM<input type="password" autoComplete="current-password" maxLength={128} value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>
      {!data.binding?<button className="button" type="button" disabled={busy||!password.trim()||!payer||!source} onClick={()=>void submit("bind")}>Registrar associação revisada</button>:null}
      <div className="form-grid">
        <button className="button" type="button" disabled={busy||!data.readbackEnabled||!data.binding} onClick={()=>setObservationId(crypto.randomUUID())}>Preparar nova observação</button>
        <label>Identificador da observação<input value={observationId} maxLength={36} disabled={busy} onChange={e=>setObservationId(e.target.value)}/></label>
        <button className="button" type="button" disabled={busy||!data.readbackEnabled||!data.binding||!password.trim()||!observationId} onClick={()=>void submit("observe")}>Consultar gateway com este identificador</button>
        <button className="button" type="button" disabled={busy||!password.trim()||!data.attempts.some(a=>a.state==="processing")} onClick={()=>void submit("quarantine")}>Isolar tentativas abandonadas</button>
      </div>
      <p>A recuperação isola apenas tentativas com mais de 30 segundos, sem repetir a consulta.</p>
      <h3>Histórico de tentativas</h3>
      {data.truncated?<p>Exibindo as 20 tentativas mais recentes.</p>:null}
      {data.attempts.length?<ul>{data.attempts.map(a=><li key={a.observationId}>
        {labels[a.state]??"Estado indisponível"} · {new Date(a.startedAt).toLocaleString("pt-BR")} · {a.observationId}
        <button type="button" disabled={busy} onClick={()=>setObservationId(a.observationId)}>Usar mesmo identificador</button>
      </li>)}</ul>:<p>Nenhuma tentativa registrada.</p>}
    </>:null}
  </section>;
}
