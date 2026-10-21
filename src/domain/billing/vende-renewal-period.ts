/** Pure FM civil-date renewal calculation. One paid billing interval, no
 * artificial 30-day month, UTC offset assumption, customer-side freeform expiry
 * or entitlement mutation. A month-end contract stays month-end.
 */
import {fmPaidThroughExclusiveInstant} from "./vende-commercial-policy-v1";
export type VendeBillingInterval="monthly"|"yearly";
export class VendeRenewalPeriodDenied extends Error{
  constructor(){super("vende.renewal_period_invalid");}
}
const DATE=/^(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
export function nextVendePaidThrough(date:string,interval:VendeBillingInterval){
  if(typeof date!=="string"||!DATE.test(date)||
     !["monthly","yearly"].includes(interval))throw new VendeRenewalPeriodDenied();
  const origin=new Date(date+"T00:00:00Z");
  if(Number.isNaN(origin.getTime())||origin.toISOString().slice(0,10)!==date)
    throw new VendeRenewalPeriodDenied();
  const year=origin.getUTCFullYear(),month=origin.getUTCMonth(),day=origin.getUTCDate();
  const oldLastDay=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  const targetMonth=month+(interval==="monthly"?1:12);
  const nextLast=new Date(Date.UTC(year,targetMonth+1,0)).getUTCDate();
  const targetDay=day===oldLastDay?nextLast:Math.min(day,nextLast);
  const next=new Date(Date.UTC(year,targetMonth,targetDay)).toISOString().slice(0,10);
  if(next<=date)throw new VendeRenewalPeriodDenied();
  return {paidThrough:next,validUntil:fmPaidThroughExclusiveInstant(next).getTime()/1000};
}
