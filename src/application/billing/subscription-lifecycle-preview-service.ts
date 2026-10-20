import type { TenantContext } from "@/domain/security/tenant-context";
import { BillingSubscriptionTraceService } from "@/application/billing/billing-subscription-trace-service";
import { previewSubscriptionLifecycle } from "@/domain/billing/subscription-lifecycle-policy";
export class SubscriptionLifecyclePreviewService {
  constructor(private readonly traces: BillingSubscriptionTraceService) {}
  async get(context: TenantContext, subscriptionId: string) {
    const trace = await this.traces.get(context, subscriptionId);
    return previewSubscriptionLifecycle(trace);
  }
}
