"use client";
import {useState} from "react";
import type {ProviderComparison,SourceAttempt}
  from "@/application/billing/vende-core-provider-exports";
import type {ProviderRequestReconciliation}
  from "@/application/billing/vende-core-request-reconciliation";

const MONEY=/^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,18})?$/;
type FeedProgress={pages:number;created:number;alreadyRecorded:number;
  unreported:number;scanned:number;lastPage:number};
export function VendeProviderExportWorkspace({productId}:{productId:string}){
  const [tenant,setTenant]=useState("");
  const [unit,setUnit]=useState("");
  const [requestId,setRequestId]=useState("");
  const [attempts,setAttempts]=useState<SourceAttempt[]>([]);
  const [selected,setSelected]=useState<SourceAttempt|null>(null);
  const [comparison,setComparison]=useState<ProviderComparison|null>(null);
  const [requestReport,setRequestReport]=useState<ProviderRequestReconciliation|null>(null);
  const [adapter,setAdapter]=useState<"openai_compatible"|"gemini">("openai_compatible");
  const [account,setAccount]=useState("");
  const [sourceRef,setSourceRef]=useState("");
  const [observed,setObserved]=useState("");
  const [inputTokens,setInputTokens]=useState("");
  const [outputTokens,setOutputTokens]=useState("");
  const [cost,setCost]=useState("");
  const [password,setPassword]=useState("");
  const [feedProvider,setFeedProvider]=useState("");
  const [feedStart,setFeedStart]=useState("");
  const [feedEnd,setFeedEnd]=useState("");
  const [feedNextPage,setFeedNextPage]=useState<number|null>(null);
  const [feedProgress,setFeedProgress]=useState<FeedProgress|null>(null);
  const resetFeed=()=>{setFeedNextPage(null);setFeedProgress(null);};
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");
  const endpoint="/api/billing/products/"+
    encodeURIComponent(productId)+"/vende-core-finops/provider-exports";
  const clear=()=>{
    setAttempts([]);setSelected(null);setComparison(null);setRequestReport(null);
    setStatus("");setError("");setPassword("");resetFeed();
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
  async function reconcileRequest(){
    if(!tenant||!unit||!requestId||!password){
      setError("Informe tenant, unidade, solicitação e senha da FM.");return;
    }
    setBusy(true);setError("");setStatus("");setRequestReport(null);
    try{
      const path=endpoint.replace("/provider-exports","/request-reconciliation");
      const result=await fetch(path,{
        method:"POST",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          externalTenantId:tenant,unitId:unit,requestId,password,
        }),
      });
      if(!result.ok)throw Error("unavailable");
      const raw=await result.json() as ProviderRequestReconciliation;
      if(raw.tenant_id!==tenant||raw.unit_id!==unit||raw.request_id!==requestId||
        raw.provider_invoice_verified!==false||
        raw.quota_recovery_authorized!==false||
        raw.real_provider_charges_certified!==false||
        !Array.isArray(raw.per_provider)||!Array.isArray(raw.attempts)||
        raw.attempts.length!==raw.attempts_observed)throw Error("untrusted");
      setRequestReport(raw);
      setStatus(raw.needs_attention?
        "Reconciliação com pendências: consulte divergências por fornecedor.":
        "Extratos observacionais coincidentes; faturas ainda não certificadas.");
    }catch{setError("Reconciliação completa indisponível ou não autorizada.");}
    finally{setBusy(false);setPassword("");}
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
        found.tenant_id!==tenant||found.unit_id!==unit||
        found.attempt_id!==id||found.request_id!==requestId||
        typeof found.needs_attention!=="boolean")throw Error("untrusted");
      setComparison(found);
    }catch{setError("A comparação do Core não foi confirmada.");}
    finally{setBusy(false);}
  }
  async function syncFeed(page=0){
    if(page!==0&&page!==feedNextPage){
      setError("Continuação inválida: reinicie a consulta com a primeira página.");
      return;
    }
    if(!tenant||!unit||!account||!feedProvider||!feedStart||!feedEnd||!password){
      setError("Preencha tenant, unidade, provedor, conta, período e senha.");
      return;
    }
    setBusy(true);setError("");setStatus("");
    if(page===0)resetFeed();
    try{
      const res=await fetch(endpoint.replace("/provider-exports","/provider-feed-sync"),{
        method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",
        body:JSON.stringify({
          externalTenantId:tenant,unitId:unit,provider:feedProvider,
          accountRef:account,startDate:feedStart,endDate:feedEnd,
          page,limit:25,password,
        }),
      });
      if(!res.ok)throw Error("unavailable");
      const data=await res.json() as {
        created:number;alreadyRecorded:number;unreported:number;
        scanned:number;nextPage:number|null;
        providerInvoiceVerified:boolean;quotaRecoveryAuthorized:boolean;
      };
      const validInt=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
      if(!validInt(data.created)||!validInt(data.alreadyRecorded)||
        !validInt(data.unreported)||!validInt(data.scanned)||
        data.scanned>25||
        data.created+data.alreadyRecorded+data.unreported!==data.scanned||
        data.providerInvoiceVerified!==false||data.quotaRecoveryAuthorized!==false||
        !(data.nextPage===null||validInt(data.nextPage)&&
          data.nextPage===page+1&&data.nextPage<=20000&&
          data.scanned>0))throw Error("untrusted");
      setFeedNextPage(data.nextPage);
      setFeedProgress(prev=>{
        const prior=page===0?null:prev;
        return {pages:(prior?.pages??0)+1,created:(prior?.created??0)+data.created,
          alreadyRecorded:(prior?.alreadyRecorded??0)+data.alreadyRecorded,
          unreported:(prior?.unreported??0)+data.unreported,
          scanned:(prior?.scanned??0)+data.scanned,lastPage:page};
      });
      setStatus("Coleta concluída nesta página: "+data.created+" nova(s), "+
        data.alreadyRecorded+" já existentes, "+data.unreported+
        " ainda sem observação. Fatura e quotas não verificadas.");
    }catch{
      // An uncertain POST may have committed records in Core. Never offer
      // an automatic continuation/retry after an unconfirmed response.
      setFeedNextPage(null);
      setError("Coleta não confirmada. Consulte o Core antes de repetir; fonte pode estar indisponível.");
    }finally{setPassword("");setBusy(false);}
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
        "Registro observacional armazenado no Core; conferindo divergências atuais.":
        "Registro já existente no Core; conferindo divergências atuais.");
      setSourceRef("");
      setPassword("");
      // A successful POST is final regardless of subsequent readback failure.
      // Never turn a failed GET into an ambiguous invitation to retry the POST.
      try{
        const id=selected.attempt_id;
        const compared=await fetch(scopeUrl(id),{cache:"no-store"});
        if(!compared.ok)throw Error("unavailable");
        const verified=await compared.json() as ProviderComparison;
        if(verified.tenant_id!==tenant||verified.unit_id!==unit||
          verified.request_id!==requestId||verified.attempt_id!==id||
          verified.provider_invoice_verified!==false||
          verified.provider_signature_verified!==false||
          verified.quota_recovery_authorized!==false||
          typeof verified.needs_attention!=="boolean")throw Error("untrusted");
        setComparison(verified);
        setStatus(data.status==="created"?
          "Observação registrada e comparação atual consultada no Core.":
          "Observação já existente; comparação atual consultada no Core.");
      }catch{
        setError("Observação registrada no Core, mas a comparação atual está indisponível. Use 'Consultar comparação'; não reenvie a importação.");
      }
    }catch{
      setError("Importação não confirmada. Consulte o Core antes de repetir.");
      setPassword("");
    }finally{setBusy(false);}
  }
  return <section className="card" aria-label="Conciliação operacional de consumo IA">
    <span className="eyebrow">FM Tecnologia IA • FinOps F3</span>
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
    <button className="button" type="button"
      disabled={busy||!tenant||!unit||!requestId||!password}
      onClick={()=>void reconcileRequest()}>
      Conciliar todos os fornecedores e fallbacks (reautenticação FM)
    </button>
    {requestReport?<section aria-label="Reconciliação consolidada de IA">
      <h3>Diagnóstico por requisição</h3>
      <p>{requestReport.attempts_observed} tentativa(s),
        {requestReport.fallback_attempts} fallback(s).
        Estado: {requestReport.needs_attention?"requer investigação":"coincidência observacional"}.
        Nenhuma fatura ou recuperação de quotas está autorizada por esta leitura.</p>
      <div className="form-grid">
        {requestReport.per_provider.map(row=><article key={row.provider} className="card">
          <strong>{row.provider}</strong>
          <p>{row.attempts} tentativas • {row.fallback_attempts} fallback(s) •
            {row.uncertain_attempts} pendência(s) • {row.missing_exports} extrato(s) ausente(s).</p>
          <p>Custo conhecido interno: {row.internal_known_cost_usd} USD.
            Extratos: {row.reported_known_cost_usd} USD.
            Diferenças: {row.cost_disagreements}.</p>
          <p>Custos desconhecidos: {row.internal_unknown_costs} internos e
            {row.reported_unknown_costs} nos extratos.</p>
        </article>)}
      </div>
    </section>:null}
    <section aria-label="Coleta configurada de relatórios de fornecedor">
      <h3>Coleta de evidências do fornecedor configurado</h3>
      <p>A origem e credencial são selecionadas exclusivamente no Core pela FM.
        Esta operação é observacional: não valida fatura, cobrança ou quotas.
        O Core informa tentativas ainda sem extrato e não inventa custo zero.</p>
      <div className="form-grid">
        <label>Provedor cadastrado no Core
          <input value={feedProvider} maxLength={128} disabled={busy}
            placeholder="Identificador do provedor"
            onChange={e=>{setFeedProvider(e.target.value);resetFeed();}}/>
        </label>
        <label>Conta do fornecedor
          <input value={account} maxLength={128} disabled={busy}
            onChange={e=>{setAccount(e.target.value);resetFeed();}}/>
        </label>
        <label>Início do período
          <input type="date" value={feedStart} disabled={busy}
            onChange={e=>{setFeedStart(e.target.value);resetFeed();}}/>
        </label>
        <label>Fim do período
          <input type="date" value={feedEnd} disabled={busy}
            onChange={e=>{setFeedEnd(e.target.value);resetFeed();}}/>
        </label>
        <label>Senha corporativa (step-up)
          <input type="password" autoComplete="off" value={password}
            disabled={busy} maxLength={128}
            onChange={e=>setPassword(e.target.value)}/>
        </label>
      </div>
      <button className="button" type="button"
        disabled={busy||!tenant||!unit||!account||!feedProvider||
          !feedStart||!feedEnd||!password}
        onClick={()=>void syncFeed(0)}>Coletar lote do fornecedor configurado</button>
      {feedProgress?<p role="status">
        Totais dos {feedProgress.pages} lote(s) confirmados:{" "}
        {feedProgress.scanned} tentativa(s) examinadas,
        {" "}{feedProgress.created} novas,
        {" "}{feedProgress.alreadyRecorded} já registradas e
        {" "}{feedProgress.unreported} sem observação.
        {feedNextPage===null?" Não há continuação confirmada no navegador.":
          " Há outra página; exige nova reautenticação."}
        Estes totais não equivalem a uma fatura do fornecedor.
      </p>:null}
      {feedNextPage!==null?<button className="button" type="button"
        disabled={busy||!password}
        onClick={()=>void syncFeed(feedNextPage)}>
        Continuar próxima página ({feedNextPage})
      </button>:null}
    </section>
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
