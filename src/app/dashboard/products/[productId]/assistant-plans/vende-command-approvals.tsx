"use client";
import { useState } from "react";
type Action="SUSPEND_DELINQUENCY"|"REACTIVATE_VERIFIED"|"SCHEDULE_CANCEL"|"RENEW_VERIFIED";
type Item={id:string;action:Action;operationId:string;invoiceId:string|null;revision:number;approvedAt:string|null;claimedAt:string|null};
export function VendeCommandApprovals({productId}:{productId:string}){
  const [action,setAction]=useState<Action>("SUSPEND_DELINQUENCY");
  const [items,setItems]=useState<Item[]>([]);const [loaded,setLoaded]=useState(false);
  const [truncated,setTruncated]=useState(false);const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const url=`/api/billing/products/${encodeURIComponent(productId)}/vende-command-approvals`;
  const kind=action==="REACTIVATE_VERIFIED"?"reativação":action==="SCHEDULE_CANCEL"?"cancelamento definitivo ao término pago":action==="RENEW_VERIFIED"?"renovação verificada":"suspensão";
  async function load(){
    const r=await fetch(`${url}?action=${encodeURIComponent(action)}`,{cache:"no-store"});
    if(!r.ok)throw Error("unavailable");
    const data=await r.json() as {items:Item[];truncated:boolean};
    setItems(data.items.filter(item=>item.action===action));setTruncated(data.truncated);setLoaded(true);
  }
  async function refresh(){
    setBusy(true);setMessage("");
    try{await load();}catch{setLoaded(false);setItems([]);setMessage("Não foi possível consultar as aprovações.");}finally{setBusy(false);}
  }
  async function approve(item:Item){
    if(item.action!==action)return;
    setBusy(true);setMessage("");
    try{
      const r=await fetch(url,{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,commandId:item.id,expectedApprovedAt:item.approvedAt,password})});
      if(!r.ok)throw Error("denied");
      setMessage("Nova aprovação registrada por até cinco minutos. Nenhum comando foi enviado.");
      try{await load();}catch{setLoaded(false);setItems([]);setMessage("Aprovação registrada. Atualize a lista para conferir o estado atual.");}
    }catch{setMessage("Reaprovação não confirmada. Atualize a lista e confira o contrato e a evidência financeira antes de tentar novamente.");}
    finally{setPassword("");setBusy(false);}
  }
  return <section className="card" aria-label="Reaprovação comercial governada">
    <h2>Aprovações de comandos comerciais</h2>
    <p>Somente comandos pendentes e nunca tentados podem ser reaprovados. A FM verifica novamente contrato, pagamento quando aplicável, vínculo SaaS e período pago integral. Operações de resultado incerto exigem reconciliação, nunca novo envio.</p>
    <label>Operação
      <select value={action} disabled={busy} onChange={e=>{
        setAction(e.target.value as Action);setLoaded(false);setItems([]);setTruncated(false);setPassword("");setMessage("");
      }}>
        <option value="SUSPEND_DELINQUENCY">Suspensão por inadimplência</option>
        <option value="REACTIVATE_VERIFIED">Reativação após pagamento confirmado</option>
        <option value="SCHEDULE_CANCEL">Cancelamento ao fim do período pago (exige aprovação na data)</option>
        <option value="RENEW_VERIFIED">Renovação com pagamento verificado</option>
      </select>
    </label>
    <button type="button" className="button" disabled={busy} onClick={()=>void refresh()}>Consultar aprovações pendentes</button>
    <label>Senha para reaprovar {kind}
      <input type="password" autoComplete="current-password" maxLength={128} value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/>
    </label>
    {busy?<p role="status">Processando…</p>:null}{message?<p role="status">{message}</p>:null}
    {truncated?<p>Exibindo os 50 comandos mais antigos. Atualize após tratar estas pendências.</p>:null}
    {loaded&&!items.length?<p>Nenhum comando pendente encontrado.</p>:null}
    <ul>{items.map(item=><li key={item.id}>
      <p>Operação {item.operationId} · revisão {item.revision} · fatura {item.invoiceId??"indisponível"}.</p>
      <p>Última aprovação: {item.approvedAt?new Date(item.approvedAt).toLocaleString("pt-BR"):"sem registro válido"}.</p>
      <button type="button" className="button" disabled={busy||!password.trim()||!!item.claimedAt}
        onClick={()=>void approve(item)}>Revisado: reaprovar {kind}</button>
    </li>)}</ul>
    <p>Aprovações ainda válidas não são renovadas. Esta ação não envia comandos, não muda pagamentos e não altera a licença do cliente.</p>
  </section>;
}
