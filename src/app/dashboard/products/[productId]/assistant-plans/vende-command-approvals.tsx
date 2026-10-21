"use client";
import { useState } from "react";
type Item={id:string;operationId:string;invoiceId:string|null;revision:number;approvedAt:string|null;claimedAt:string|null};
export function VendeCommandApprovals({productId}:{productId:string}){
  const [items,setItems]=useState<Item[]>([]);const [loaded,setLoaded]=useState(false);
  const [truncated,setTruncated]=useState(false);const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const url=`/api/billing/products/${encodeURIComponent(productId)}/vende-command-approvals`;
  async function load(){
    const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw Error("unavailable");
    const data=await r.json() as {items:Item[];truncated:boolean};
    setItems(data.items);setTruncated(data.truncated);setLoaded(true);
  }
  async function refresh(){
    setBusy(true);setMessage("");
    try{await load();}catch{setLoaded(false);setItems([]);setMessage("Não foi possível consultar as aprovações.");}finally{setBusy(false);}
  }
  async function approve(item:Item){
    setBusy(true);setMessage("");
    try{
      const r=await fetch(url,{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({commandId:item.id,expectedApprovedAt:item.approvedAt,password})});
      if(!r.ok)throw Error("denied");
      setMessage("Nova aprovação registrada por até cinco minutos. Nenhum comando foi enviado.");
      try{await load();}catch{setLoaded(false);setItems([]);setMessage("Aprovação registrada. Atualize a lista para conferir o estado atual.");}
    }catch{setMessage("Reaprovação não confirmada. Atualize a lista e confira o estado do contrato e do pagamento antes de tentar novamente.");}
    finally{setPassword("");setBusy(false);}
  }
  return <section className="card" aria-label="Reaprovação de suspensões comerciais">
    <h2>Aprovações de suspensão</h2>
    <p>Reaprove somente uma suspensão pendente que você revisou. O servidor confere novamente o contrato e a evidência de inadimplência.
      Operações já tentadas ou com resultado incerto exigem reconciliação.</p>
    <button type="button" className="button" disabled={busy} onClick={()=>void refresh()}>Consultar aprovações pendentes</button>
    <label>Senha para reaprovar suspensão<input type="password" autoComplete="current-password" maxLength={128} value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>
    {busy?<p role="status">Processando…</p>:null}{message?<p role="status">{message}</p>:null}
    {truncated?<p>Exibindo os 50 comandos mais antigos. Atualize a lista após tratar estas pendências.</p>:null}
    {loaded&&!items.length?<p>Nenhum comando pendente encontrado.</p>:null}
    <ul>{items.map(item=><li key={item.id}>
      <p>Operação {item.operationId} · revisão {item.revision} · fatura {item.invoiceId??"indisponível"}.</p>
      <p>Última aprovação: {item.approvedAt?new Date(item.approvedAt).toLocaleString("pt-BR"):"sem registro válido"}.</p>
      <button type="button" className="button" disabled={busy||!password.trim()||!!item.claimedAt} onClick={()=>void approve(item)}>Revisado: reaprovar suspensão</button>
    </li>)}</ul>
    <p>Aprovações ainda válidas não são renovadas. Esta ação não envia suspensão nem altera a licença.</p>
  </section>;
}
