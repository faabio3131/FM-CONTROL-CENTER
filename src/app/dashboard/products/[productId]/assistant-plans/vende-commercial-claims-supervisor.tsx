"use client";
import {useState} from "react";

type State="pending"|"processing"|"unknown"|"blocked"|"delivered";
type Claim={
  id:string;action:string;operationId:string;state:State;
  revision:number;sourceInvoiceId:string|null;createdAt:string;
  approvedAt:string|null;claimedAt:string|null;deliveredAt:string|null;
};
type Snapshot={
  totals:Record<State,number>;staleProcessing:number;expiredApprovals:number;compensationReviewEvents:number;
  alert:"healthy"|"attention"|"critical";items:Claim[];truncated:boolean;
  runtimeEntitlementVerified:false;
};
const stateName:Record<State,string>={
  pending:"Pendente",processing:"Processando",unknown:"Resultado incerto",
  blocked:"Bloqueado",delivered:"Entrega confirmada no Command",
};
const actionName:Record<string,string>={
  SUSPEND_DELINQUENCY:"Suspensão por inadimplência",
  REACTIVATE_VERIFIED:"Reativação verificada",
  SCHEDULE_CANCEL:"Cancelamento programado",
  APPLY_UPGRADE:"Upgrade",APPLY_DOWNGRADE:"Downgrade",RENEW_VERIFIED:"Renovação",
};

export function VendeCommercialClaimsSupervisor({productId}:{productId:string}){
  const [data,setData]=useState<Snapshot|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function refresh(){
    setBusy(true);setError("");
    try{
      const res=await fetch(`/api/billing/products/${encodeURIComponent(productId)}/vende-commercial-claims`,{cache:"no-store"});
      if(!res.ok)throw Error("unavailable");
      setData(await res.json() as Snapshot);
    }catch{setData(null);setError("Não foi possível consultar os comandos comerciais.");}
    finally{setBusy(false);}
  }
  return <section className="card" aria-label="Supervisão do ciclo comercial">
    <span className="eyebrow">FM Tecnologia IA · contratos e licenças</span>
    <h2>Supervisão de comandos comerciais</h2>
    <p>Consulta somente leitura dos comandos registrados no Command. Uma operação pendente
      ou incerta não prova suspensão ou reativação no SaaS; nenhuma nova tentativa é feita nesta tela.</p>
    <button type="button" className="button" disabled={busy} onClick={()=>void refresh()}>
      Atualizar indicadores comerciais
    </button>
    {busy?<p role="status">Consultando…</p>:null}
    {error?<p role="status">{error}</p>:null}
    {data?<div className="foundation-grid" aria-label="Indicadores do ciclo comercial">
      <article><strong>Pendentes</strong><span>{data.totals.pending}</span></article>
      <article><strong>Processando</strong><span>{data.totals.processing}</span></article>
      <article><strong>Incertos</strong><span>{data.totals.unknown}</span></article>
      <article><strong>Bloqueados</strong><span>{data.totals.blocked}</span></article>
      <article><strong>Entregues</strong><span>{data.totals.delivered}</span></article>
      <article><strong>Processamentos antigos</strong><span>{data.staleProcessing}</span></article>
      <article><strong>Aprovações vencidas</strong><span>{data.expiredApprovals}</span></article>
      <article><strong>Alertas de compensação registrados</strong><span>{data.compensationReviewEvents}</span></article>
    </div>:null}
    {data?<p role="status">Situação: {data.alert==="critical"?"intervenção e reconciliação necessárias":
      data.alert==="attention"?"há aprovações pendentes de revisão":"sem alerta identificado"}.
      A vigência efetiva da licença deve ser comprovada diretamente no Assistant.</p>:null}
    {data?.compensationReviewEvents?<p role="status">Alertas históricos de divergência entre estado remoto aplicado e confirmação financeira/contratual local. Não significam casos ainda abertos ou compensação executada. Exigem investigação corporativa.</p>:null}
    {data?.truncated?<p>Exibindo 50 comandos prioritários. Os totais acima consideram todos os registros do produto.</p>:null}
    {data&&!data.items.length?<p>Nenhum comando registrado para este produto.</p>:null}
    {data?.items.length?<div className="product-grid">{data.items.map(item=>
      <article className="product-card" key={item.id}>
        <strong>{stateName[item.state]??item.state} · {actionName[item.action]??item.action}</strong>
        <span>Operação {item.operationId} · revisão {item.revision}</span>
        <small>Fatura {item.sourceInvoiceId??"não aplicável"}</small>
        <small>Criado em {new Date(item.createdAt).toLocaleString("pt-BR")}</small>
        {item.state==="unknown"?<small>Exige leitura assinada de reconciliação. Nunca reenviar cegamente.</small>:null}
        {item.state==="processing"?<small>Checar se a tentativa ficou órfã antes de qualquer intervenção.</small>:null}
      </article>
    )}</div>:null}
    <p>Indicadores não concedem entitlement, não modificam contratos e não executam rotinas automáticas.</p>
  </section>;
}
