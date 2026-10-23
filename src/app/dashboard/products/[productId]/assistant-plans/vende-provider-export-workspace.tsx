"use client";
import {useState} from "react";
import type {ProviderComparison,SourceAttempt}
  from "@/application/billing/vende-core-provider-exports";

const MONEY=/^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,18})?$/;
export function VendeProviderExportWorkspace({productId}:{productId:string}){
  const [tenant,setTenant]=useState("");
  const [unit,setUnit]=useState("");
  const [requestId,setRequestId]=useState("");
  const [attempts,setAttempts]=useState<SourceAttempt[]>([]);
  const [selected,setSelected]=useState<SourceAttempt|null>(null);
  const [comparison,setComparison]=useState<ProviderComparison|null>(null);
  const [adapter,setAdapter]=useState<"openai_compatible"|"gemini">("openai_compatible");
  const [account,setAccount]=useState("");
  const [sourceRef,setSourceRef]=useState("");
  const [observed,setObserved]=useState("");
  const [inputTokens,setInputTokens]=useState("");
  const [outputTokens,setOutputTokens]=useState("");
  const [cost,setCost]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");
  const endpoint="/api/billing/products/"+
    encodeURIComponent(productId)+"/vende-core-finops/provider-exports";
  const clear=()=>{
    setAttempts([]);setSelected(null);setComparison(null);
    setStatus("");setError("");setPassword("");
  };
  function scopeUrl(id?:string){
    return endpoint+"?"+new URLSearchParams({
      externalTenantId:tenant,unitId:unit,requestId,
      ...(id?{attemptId:id}:{}),
    });
  }
  async function load(){
    setBusy(true);setError("");setStatus("");setSelected(null);setComparison(null);
    try{
      const r=await fetch(scopeUrl(),{cache:"no-store"});
      if(!r.ok)throw Error("unavailable");
      const rows=await r.json() as SourceAttempt[];
      if(!Array.isArray(rows)||rows.length>100||
        rows.some(x=>!x||typeof x.event_id!=="string"||
        !(x.attempt_id===null||typeof x.attempt_id==="string")||
        typeof x.provider!=="string"||typeof x.model!=="string"))
        throw Error("untrusted");
      setAttempts(rows);
      setStatus(rows.length+" tentativa(s) localizadas no ledger Core.");
    }catch{setAttempts([]);setError("Não foi possível consultar as tentativas no Core.");}
    finally{setBusy(false);}
  }
  async function inspect(id:string){
    setBusy(true);setError("");setComparison(null);setStatus("");
    try{
      const res=await fetch(scopeUrl(id),{cache:"no-store"});
      if(!res.ok)throw Error("unavailable");
      const found=await res.json() as ProviderComparison;
      if(found.provider_invoice_verified!==false||
        found.provider_signature_verified!==false||
        found.quota_recovery_authorized!==false||
        found.attempt_id!==id||found.request_id!==requestId||
        typeof found.needs_attention!=="boolean")throw Error("untrusted");
      setComparison(found);
    }catch{setError("A comparação do Core não foi confirmada.");}
    finally{setBusy(false);}
  }
  async function submit(){
    if(!selected?.attempt_id||!password||!account||!sourceRef||!observed){
      setError("Selecione uma tentativa e preencha conta, origem, data e senha.");
      return;
    }
    if(cost&&!MONEY.test(cost)){
      setError("Custo USD inválido. Use valor decimal sem arredondamento.");
      return;
    }
    const parseTokens=(raw:string)=>raw===""?null:
      /^\d{1,10}$/.test(raw)&&Number(raw)<=2_000_000_000?Number(raw):undefined;
    const input=parseTokens(inputTokens),output=parseTokens(outputTokens);
    if(input===undefined||output===undefined){
      setError("Contadores inválidos. Campo vazio permanece desconhecido.");
      return;
    }
    const usage=adapter==="gemini"?
      {promptTokenCount:input,candidatesTokenCount:output}:
      {prompt_tokens:input,completion_tokens:output};
    setBusy(true);setError("");setStatus("");setComparison(null);
    try{
      const res=await fetch(endpoint,{
        method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",
        body:JSON.stringify({
          externalTenantId:tenant,unitId:unit,requestId,password,
          source:{attemptId:selected.attempt_id,provider:selected.provider,
            model:selected.model,adapter,accountRef:account,sourceRef,
            observedAt:new Date(observed).toISOString(),usage,costUsd:cost||null},
        }),
      });
      if(!res.ok)throw Error("unconfirmed");
      const data=await res.json() as {status?:string};
      if(!["created","already_recorded"].includes(data.status??""))
        throw Error("untrusted");
      setStatus(data.status==="created"?
        "Registro observacional armazenado no Core. Consulte a comparação.":
        "Esse registro já estava armazenado, sem duplicação.");
      setPassword("");
    }catch{
      setError("Importação não confirmada. Consulte o Core antes de repetir.");
      setPassword("");
    }finally{setBusy(false);}
  }
  return <section className="card" aria-label="Conciliação operacional de consumo IA">
    <span className="eyebrow">FM Tecnologia • FinOps F3</span>
    <h2>Conciliação de evidências por tentativa de IA</h2>
    <p>Consulte as tentativas efetivas, selecione o registro e informe os dados
      obtidos de uma fonte de consumo do fornecedor. A importação é histórica e
      exige reautenticação. A coincidência de números não comprova fatura,
      assinatura do fornecedor nem autoriza cobrança ou liberação de franquia.</p>
    <div className="form-grid">
      <label>Tenant VendeAtendeIA
        <input value={tenant} maxLength={128} disabled={busy}
          onChange={e=>{setTenant(e.target.value);clear();}}/>
      </label>
      <label>Unidade
        <input value={unit} maxLength={128} disabled={busy}
          onChange={e=>{setUnit(e.target.value);clear();}}/>
      </label>
      <label>ID da solicitação de IA
        <input value={requestId} maxLength={128} disabled={busy}
          onChange={e=>{setRequestId(e.target.value);clear();}}/>
      </label>
    </div>
    <button className="button" type="button" disabled={busy||!tenant||!unit||!requestId}
      onClick={()=>void load()}>Buscar tentativas no Core</button>
    {attempts.length>0?<div>
      <h3>Tentativas registradas</h3>
      <div className="form-grid">
        {attempts.map(item=><button type="button" className="button"
          key={item.event_id} disabled={busy||!item.attempt_id}
          onClick={()=>{setSelected(item);setComparison(null);setStatus("");}}>
          {item.provider} / {item.model} • {item.outcome}
          {item.fallback?" • fallback":""} • {item.attempt_id??"sem ID físico"}
        </button>)}
      </div>
    </div>:null}
    {selected?.attempt_id?<div>
      <p>Tentativa selecionada: <strong>{selected.attempt_id}</strong>.
        Entrada interna: {selected.input_tokens??"desconhecida"};
        saída interna: {selected.output_tokens??"desconhecida"};
        custo interno: {selected.cost_known_subtotal_usd??"desconhecido"} USD.</p>
      <button type="button" className="button" disabled={busy}
        onClick={()=>void inspect(selected.attempt_id!)}>
        Consultar comparação no Core
      </button>
      <h3>Importar observação da fonte do fornecedor</h3>
      <p>Não copie automaticamente os contadores internos: informe apenas valores
        efetivamente observados na fonte externa. Campo vazio significa desconhecido.</p>
      <div className="form-grid">
        <label>Formato da fonte
          <select value={adapter} disabled={busy}
            onChange={e=>setAdapter(e.target.value as "openai_compatible"|"gemini")}>
            <option value="openai_compatible">OpenAI-compatible</option>
            <option value="gemini">Gemini</option>
          </select>
        </label>
        <label>Referência da conta do fornecedor
          <input value={account} maxLength={128} disabled={busy}
            onChange={e=>setAccount(e.target.value)}/>
        </label>
        <label>ID único do registro de origem
          <input value={sourceRef} maxLength={128} disabled={busy}
            onChange={e=>setSourceRef(e.target.value)}/>
        </label>
        <label>Data e hora da observação (fuso local)
          <input type="datetime-local" value={observed} disabled={busy}
            onChange={e=>setObserved(e.target.value)}/>
        </label>
        <label>Tokens de entrada observados
          <input inputMode="numeric" value={inputTokens} disabled={busy}
            onChange={e=>setInputTokens(e.target.value)} maxLength={10}/>
        </label>
        <label>Tokens de saída observados
          <input inputMode="numeric" value={outputTokens} disabled={busy}
            onChange={e=>setOutputTokens(e.target.value)} maxLength={10}/>
        </label>
        <label>Custo observado (USD, opcional)
          <input inputMode="decimal" value={cost} disabled={busy}
            onChange={e=>setCost(e.target.value)} maxLength={36}/>
        </label>
        <label>Senha corporativa para confirmar
          <input type="password" autoComplete="off" value={password}
            disabled={busy} maxLength={128}
            onChange={e=>setPassword(e.target.value)}/>
        </label>
      </div>
      <button type="button" className="button"
        disabled={busy||!password||!account||!sourceRef||!observed}
        onClick={()=>void submit()}>Importar registro com reautenticação</button>
    </div>:null}
    {comparison?<div role="status">
      <p>Estado da conciliação: <strong>{comparison.status}</strong></p>
      <p>Origem: {comparison.source_ref??"sem registro de fornecedor"}.
        Tokens de entrada: {comparison.input_tokens_reported??"desconhecidos"};
        saída: {comparison.output_tokens_reported??"desconhecidos"}.
        Custo relatado: {comparison.report_cost_usd??"desconhecido"} USD;
        custo interno: {comparison.internal_cost_usd??"desconhecido"} USD.</p>
      <p>Consumo coincidente: {comparison.usage_matches===null?"indeterminado":
        comparison.usage_matches?"sim":"não"};
        custo coincidente: {comparison.cost_matches===null?"indeterminado":
          comparison.cost_matches?"sim":"não"};
        acompanhamento: {comparison.needs_attention?"necessário":"sem divergência numérica observada"}.</p>
    </div>:null}
    {busy?<p role="status">Operação em andamento...</p>:null}
    {status?<p role="status">{status}</p>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
