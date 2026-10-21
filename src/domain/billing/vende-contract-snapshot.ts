/** Historical contractual revision, separate from remote entitlement delivery.
 * Explicit fields exclude secrets and mutable provider response bodies. */
export type VendeContractTermsSnapshot={
  id:string;tenantId:string;productId:string;subscriptionId:string;customerId:string;
  revision:number;effectiveFrom:string;paidThrough:string;dueDate:string;autoRenew:boolean;
  lifecycleState:string;calendarRegion:string;sourceRef:string;actorId:string;
  updatedAt:string;createdAt:string;
};
export type VendeContractRevisionSnapshot={
  schema:"fm.vende.contract-terms.v1";
  before:VendeContractTermsSnapshot|null;
  after:VendeContractTermsSnapshot;
};
type Terms=Omit<VendeContractTermsSnapshot,"createdAt"|"updatedAt">&{createdAt:Date;updatedAt:Date};
function capture(t:Terms):VendeContractTermsSnapshot{
  return {id:t.id,tenantId:t.tenantId,productId:t.productId,subscriptionId:t.subscriptionId,
    customerId:t.customerId,revision:t.revision,effectiveFrom:t.effectiveFrom,paidThrough:t.paidThrough,
    dueDate:t.dueDate,autoRenew:t.autoRenew,lifecycleState:t.lifecycleState,calendarRegion:t.calendarRegion,
    sourceRef:t.sourceRef,actorId:t.actorId,createdAt:t.createdAt.toISOString(),updatedAt:t.updatedAt.toISOString()};
}
export function captureVendeContractRevision(before:Terms|null,after:Terms):VendeContractRevisionSnapshot{
  return {schema:"fm.vende.contract-terms.v1",before:before?capture(before):null,after:capture(after)};
}
