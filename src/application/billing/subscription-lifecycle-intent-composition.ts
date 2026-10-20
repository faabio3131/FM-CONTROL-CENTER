import { BillingSubscriptionTraceService } from "@/application/billing/billing-subscription-trace-service";
import { SubscriptionLifecycleIntentService } from "@/application/billing/subscription-lifecycle-intent-service";
import { PostgresBillingSubscriptionTraceRepository } from "@/infrastructure/billing/postgres-billing-subscription-trace-repository";
import { PostgresSubscriptionLifecycleIntentStore } from "@/infrastructure/billing/postgres-subscription-lifecycle-intent-store";

/** Shared composition for preview and recording; never an executable queue. */
export const buildLifecycleIntentService = () => new SubscriptionLifecycleIntentService(
  new BillingSubscriptionTraceService(new PostgresBillingSubscriptionTraceRepository()),
  new PostgresSubscriptionLifecycleIntentStore(),
);
