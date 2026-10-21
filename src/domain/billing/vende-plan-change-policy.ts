/** Commercial changes alter only FM-governed consumption ceilings, not
 * functions. A plan tier is a strict dominance relation over the same complete
 * quota-key set, within the same billing interval. Never infer a tier from a name.
 */
export type VendePlanChangeAction="APPLY_UPGRADE"|"APPLY_DOWNGRADE";
export type VendePlanAllowance={
  resource:string;scope:"tenant"|"unit";limitUnits:number;windowSeconds:number;
};
export type VendePlanChangeDirection={
  oldPlanCode:string;newPlanCode:string;oldPriceMinor:number;newPriceMinor:number;
  oldInterval:string;newInterval:string;
  oldAllowances:readonly VendePlanAllowance[];newAllowances:readonly VendePlanAllowance[];
};
export class VendePlanChangeDenied extends Error{
  constructor(){super("vende.plan_change_denied");}
}
const deny=():never=>{throw new VendePlanChangeDenied();};
function keyed(allowances:readonly VendePlanAllowance[]){
  const out=new Map<string,number>();
  if(!Array.isArray(allowances)||allowances.length<2)return deny();
  for(const x of allowances){
    if(!x||typeof x.resource!=="string"||!x.resource||
       !["tenant","unit"].includes(x.scope)||
       !Number.isSafeInteger(x.limitUnits)||x.limitUnits<1||
       !Number.isSafeInteger(x.windowSeconds)||x.windowSeconds<1)return deny();
    const k=[x.resource,x.scope,x.windowSeconds].join("|");
    if(out.has(k))return deny();
    out.set(k,x.limitUnits);
  }
  if(![...out.keys()].some(x=>x.startsWith("ai.requests|"))||
     ![...out.keys()].some(x=>x.startsWith("ai.total_tokens|")))return deny();
  return out;
}
/** Fail closed if quotas conflict, tiers incomparable, intervals differ, or
 * the monetary direction contradicts the quota direction. No implicit proration. */
export function requireVendePlanChange(action:VendePlanChangeAction,x:VendePlanChangeDirection){
  if(!["APPLY_UPGRADE","APPLY_DOWNGRADE"].includes(action)||
     x.oldPlanCode===x.newPlanCode||
     !["monthly","yearly"].includes(x.oldInterval)||
     x.oldInterval!==x.newInterval||
     !Number.isSafeInteger(x.oldPriceMinor)||!Number.isSafeInteger(x.newPriceMinor)||
     x.oldPriceMinor<=0||x.newPriceMinor<=0)return deny();
  const from=keyed(x.oldAllowances),to=keyed(x.newAllowances);
  if(from.size!==to.size)return deny();
  let changed=false;
  for(const [k,v] of from){
    const next=to.get(k);if(next===undefined)return deny();
    if(action==="APPLY_UPGRADE"&&next<v)return deny();
    if(action==="APPLY_DOWNGRADE"&&next>v)return deny();
    if(next!==v)changed=true;
  }
  if(!changed||!(action==="APPLY_UPGRADE"
    ?x.newPriceMinor>x.oldPriceMinor:x.newPriceMinor<x.oldPriceMinor))return deny();
  return true as const;
}
