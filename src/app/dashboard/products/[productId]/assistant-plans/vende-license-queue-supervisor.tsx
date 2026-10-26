"use client";

import { useCallback, useEffect, useState } from "react";

type QueueHealth = {
  pending:number; processing:number; blocked:number; delivered:number;
  staleProcessing:number; oldestPendingAgeSeconds:number|null;
  alert:"healthy"|"attention"|"critical";
};
type QueueItem = {
  outboxId:string; invoiceId:string; externalTenantId:string; planCode:string;
  planRevision:number; state:string; attempts:number;
  createdAt:string; claimedAt:string|null;
};
type QueueStatus = {
  health: QueueHealth;
  workerEnabled:boolean;
  items:QueueItem[];
};

const STATE:Record<string,string> = {
  pending:"Pendente", processing:"Processando",
  blocked:"Bloqueada", delivered:"Entregue",
};

export function VendeLicenseQueueSupervisor() {
  const [data,setData]=useState<QueueStatus|null>(null);
  const [password,setPassword]=useState("");
  const [limit,setLimit]=useState(10);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const refresh=useCallback(async()=>{
    const response=await fetch("/api/billing/vende-license-outbox",{cache:"no-store"});
    if(!response.ok) throw new Error("A fila de licenças está indisponível.");
    const next=(await response.json()) as QueueStatus;
    setData(next);
  },[]);
  useEffect(()=>{
    let cancelled=false;
    void fetch("/api/billing/vende-license-outbox",{cache:"no-store"})
      .then(async response=>{
        if(!response.ok) throw new Error("Fila indisponível.");
        return response.json() as Promise<QueueStatus>;
      }).then(next=>{if(!cancelled) setData(next);})
      .catch(()=>{if(!cancelled) setMessage("Não foi possível consultar o monitor de licenças.");});
    return ()=>{cancelled=true;};
  },[]);

  async function submit(action:"reconcile"|"run_once",outboxId?:string) {
    if(!password.trim()) {setMessage("Informe a senha da conta corporativa FM.");return;}
    setBusy(true);
    setMessage("");
    try {
      const response=await fetch("/api/billing/vende-license-outbox",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,password,...(outboxId?{outboxId}:{limit})}),
        cache:"no-store",
      });
      const body=(await response.json()) as {
        error?:string;status?:string;result?:{delivered:number;blocked:number;quarantined:number};
      };
      if(!response.ok) throw new Error(body.error??"A operação foi recusada.");
      setPassword("");
      setMessage(action==="reconcile"
        ? body.status==="delivered"?"Entrega anterior confirmada por prova assinada.":"Sem prova suficiente: licença permanece bloqueada."
        : `Lote concluído: ${body.result?.delivered??0} entregas, ${body.result?.blocked??0} falhas/contendas e ${body.result?.quarantined??0} tarefas antigas isoladas.`);
      await refresh();
    } catch(error) {
      setMessage(error instanceof Error?error.message:"A operação foi recusada.");
    } finally {setBusy(false);}
  }

  return <section className="card" aria-label="Supervisão de licenças VendeAtendeIA">
    <span className="eyebrow">FM Tecnologia IA · operação de licenças</span>
    <h2>Supervisão da fila de licenças</h2>
    <p>O Command exibe o estado persistido e não repete envios com resposta incerta.
      Uma reconciliação exige prova assinada do Assistant e senha corporativa.</p>
    {data?<div className="foundation-grid" aria-label="Indicadores da fila">
      <article><strong>Pendentes</strong><span>{data.health.pending}</span></article>
      <article><strong>Processando</strong><span>{data.health.processing}</span></article>
      <article><strong>Bloqueadas</strong><span>{data.health.blocked}</span></article>
      <article><strong>Entregues</strong><span>{data.health.delivered}</span></article>
      <article><strong>Processos antigos</strong><span>{data.health.staleProcessing}</span></article>
      <article><strong>Mais antiga pendência</strong><span>{data.health.oldestPendingAgeSeconds===null?"Nenhuma":`${data.health.oldestPendingAgeSeconds}s`}</span></article>
    </div>:<p>Indicadores ainda não disponíveis.</p>}
    <p role="status">Worker: {data?.workerEnabled?"liberado por configuração FM":"desativado por configuração"}.
      Situação da fila: {data?.health.alert==="critical"?"requer intervenção":
        data?.health.alert==="attention"?"atenção":"sem alerta confirmado"}.
    </p>
    <label>Reautenticação do administrador FM
      <input type="password" autoComplete="current-password" value={password}
        onChange={e=>setPassword(e.target.value)} maxLength={128}/>
    </label>
    <div className="form-grid">
      <label>Tamanho do lote (1–20)
        <input type="number" min="1" max="20" step="1" value={limit}
          onChange={e=>setLimit(Number(e.target.value))}/>
      </label>
      <button className="button" type="button"
        disabled={busy||!data?.workerEnabled||!Number.isInteger(limit)||limit<1||limit>20}
        onClick={()=>void submit("run_once")}>
        Executar lote governado
      </button>
      <button className="button" type="button" disabled={busy}
        onClick={()=>void refresh().catch(()=>setMessage("Monitor indisponível."))}>
        Atualizar fila
      </button>
    </div>
    {message?<p role="status">{message}</p>:null}
    <h3>Pendências e entregas bloqueadas</h3>
    <p>A lista apresenta até 50 entradas recentes. Os totais acima abrangem todas as entradas do tenant corporativo.</p>
    {data?.items.length ? <div className="product-grid">{data.items.map(item=>
      <article className="product-card" key={item.outboxId}>
        <strong>{STATE[item.state]??item.state} · {item.planCode} v{item.planRevision}</strong>
        <span>Cliente: {item.externalTenantId}</span>
        <small>Fatura {item.invoiceId} · tentativa {item.attempts}</small>
        <small>Criada em {new Date(item.createdAt).toLocaleString("pt-BR")}</small>
        {item.state==="blocked"?<button type="button" className="button" disabled={busy}
          onClick={()=>void submit("reconcile",item.outboxId)}>
          Conferir entrega por prova assinada
        </button>:null}
      </article>
    )}</div>:<p>Nenhuma entrada recente pendente, em processamento ou bloqueada.</p>}
  </section>;
}
