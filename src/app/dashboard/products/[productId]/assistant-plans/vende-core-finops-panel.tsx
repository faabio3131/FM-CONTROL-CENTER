"use client";
import {useState} from "react";
import type {CoreFinopsReport} from "@/application/billing/vende-core-finops-reader";

export function VendeCoreFinopsPanel({productId}:{productId:string}){
  const [tenant,setTenant]=useState("");
  const [unit,setUnit]=useState("");
  const [startDate,setStartDate]=useState("");
  const [endDate,setEndDate]=useState("");
  const [report,setReport]=useState<CoreFinopsReport|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function consult(){
    setBusy(true);setError("");setReport(null);
    try{
      const result=await fetch(
        `/api/billing/products/${encodeURIComponent(productId)}/vende-core-finops`,
        {method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            externalTenantId:tenant,unitId:unit,startDate,endDate,
          })},
      );
      if(!result.ok)throw Error("finops_unavailable");
      const data=await result.json() as CoreFinopsReport;
      if(data.internal_fm_cost_only!==true||
         data.actual_provider_spend_verified!==false||
         data.commercial_revenue_included!==false||
         data.tenant_id!==tenant||data.unit_id!==unit||
         !Array.isArray(data.buckets))throw Error("finops_invalid");
      setReport(data);
    }catch{
      setError("Dados do Core indisponíveis ou integração ainda não configurada. Nenhum custo ou saldo foi presumido.");
    }finally{setBusy(false);}
  }
  return <section className="card" aria-label="FinOps interno de inteligência artificial">
    <span className="eyebrow">FM Tecnologia · despesas internas com IA</span>
    <h2>Consumo e custos técnicos do Core</h2>
    <p>Consulta corporativa de tentativas, fallback e custo estimado por
      modelo, moeda, cliente e unidade. O fornecedor de IA é pago pela FM,
      não pelo cliente. As receitas comerciais são controladas separadamente.</p>
    <div className="form-grid">
      <label>Identificador do tenant no VendeAtendeIA
        <input type="text" value={tenant} maxLength={128} disabled={busy}
          onChange={e=>{setTenant(e.target.value);setReport(null);}}/>
      </label>
      <label>Identificador da unidade no VendeAtendeIA
        <input type="text" value={unit} maxLength={128} disabled={busy}
          onChange={e=>{setUnit(e.target.value);setReport(null);}}/>
      </label>
      <label>Data inicial (UTC)
        <input type="date" value={startDate} disabled={busy}
          onChange={e=>{setStartDate(e.target.value);setReport(null);}}/>
      </label>
      <label>Data final (UTC)
        <input type="date" value={endDate} disabled={busy}
          onChange={e=>{setEndDate(e.target.value);setReport(null);}}/>
      </label>
    </div>
    <button type="button" className="button" disabled={busy||!tenant||!unit||!startDate||!endDate}
      onClick={()=>void consult()}>Consultar ledger interno do Core</button>
    {busy?<p role="status">Consultando dados autenticados...</p>:null}
    {error?<p role="alert">{error}</p>:null}
    {report?<div role="status" aria-live="polite">
      <h3>Histórico técnico de {report.start_date} a {report.end_date}</h3>
      <p><strong>{report.known_attempts}</strong> tentativa(s) com custo calculado;
        <strong> {report.unknown_attempts}</strong> com custo desconhecido.</p>
      <p>{report.coverage==="no_observations"
        ?"Sem observações no ledger. Isso não comprova custo zero."
        :report.coverage==="partial_unknown_costs"
          ?"Custos incompletos: os subtotais conhecidos não representam o custo total."
          :"Custos de todas as tentativas registradas foram precificados internamente, sem comprovação da fatura do fornecedor."}
      </p>
      {report.buckets.length===0?<p>Não há observações disponíveis neste intervalo.</p>:null}
      <div className="product-grid">{report.buckets.map((bucket,index)=>
        <article className="product-card" key={index}>
          <strong>{bucket.day} · {bucket.provider} / {bucket.model}</strong>
          <small>{bucket.capability} · {bucket.outcome} · {bucket.currency}</small>
          <p>{bucket.attempts} tentativa(s), sendo {bucket.fallback_attempts} fallback(s).</p>
          <p>Tokens observados: {bucket.input_tokens_observed} entrada;
            {" "}{bucket.output_tokens_observed} saída; {bucket.cached_tokens_observed} cache.</p>
          <p>Subtotal de custos calculáveis: <strong>
            {bucket.known_cost_events>0
              ?bucket.currency+" "+bucket.known_cost_subtotal
              :"Não disponível (nenhuma tentativa precificada)"}
          </strong></p>
          <p>{bucket.unknown_cost_events} tentativa(s) com custo não determinado.
            {bucket.unknown_cost_events>0?" O subtotal não representa o custo total.":""}
          </p>
        </article>
      )}</div>
      <p>Os custos exibidos são internos e estimados a partir dos registros disponíveis.
        Nenhum valor desconhecido é convertido em zero e nenhuma operação financeira é executada.</p>
    </div>:null}
  </section>;
}
