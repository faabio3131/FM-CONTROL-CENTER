/** Presentation-only interpretation of read-only compensation evidence.
 * Never use these labels or their severities to authorize a commercial command.
 * API metadata is untrusted at the UI boundary: unknown outcomes fail closed.
 */
export type VendeEvidenceView={
  level:"critical"|"attention"|"review";
  heading:string;
  financeLabel:string;
  invoiceLabel:string;
  notice:string;
};
const FINANCE:Record<string,string>={
  settled_verified:"Liquidação verificada",
  reversed_verified:"Reversão verificada",
  unpaid_verified:"Não pagamento verificado",
  unavailable:"Evidência financeira indisponível",
};
const INVOICE:Record<string,string>={
  paid:"Fatura paga no Command",
  pending:"Fatura pendente no Command",
  other:"Fatura com outro estado no Command",
  not_applicable:"Sem fatura aplicável",
};
const NOTICE="Leitura de evidência apenas. Nenhuma licença, pagamento ou contrato foi alterado; o caso permanece aberto.";

export function describeVendeCompensationObservation(raw:unknown):VendeEvidenceView|null{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
  const data=raw as Record<string,unknown>;
  // Reject a response that even claims remediation, or lacks the explicit
  // no-mutation safeguards; never render it as a successful human review.
  if(data.remoteObserved!==true||data.remediationDispatched!==false||
     data.automaticCompensationAuthorized!==false||data.caseResolved!==false||
     typeof data.state!=="string"||typeof data.financeState!=="string"||
     typeof data.invoiceState!=="string")return null;
  const financeLabel=FINANCE[data.financeState];
  const invoiceLabel=INVOICE[data.invoiceState];
  if(typeof financeLabel!=="string"||typeof invoiceLabel!=="string")return null;
  let level:VendeEvidenceView["level"]="review";
  let heading:string;
  switch(data.state){
    case "remote_suspended_after_finance_settled":
      if(data.financeState!=="settled_verified")return null;
      level="critical";
      heading="Divergência crítica: pagamento verificado, mas suspensão aplicada";
      break;
    case "remote_applied_finance_reversed":
      if(data.financeState!=="reversed_verified")return null;
      level="critical";
      heading="Operação remota aplicada com reversão financeira verificada";
      break;
    case "remote_applied_finance_settled":
      if(data.financeState!=="settled_verified")return null;
      level="attention";
      heading="Operação remota aplicada e liquidação verificada; revisão ainda necessária";
      break;
    case "remote_operation_not_applied":
      level="attention";
      heading="Operação não aplicada no Assistant; requer reconciliação humana";
      break;
    case "human_reconciliation_required":
      heading="Evidências inconclusivas: reconciliação humana necessária";
      break;
    default:
      return null;
  }
  return {level,heading,financeLabel,invoiceLabel,notice:NOTICE};
}
