import { and, desc, eq, sql } from "drizzle-orm";
import type { TenantContext } from "@/domain/security/tenant-context";
import { requirePermission } from "@/domain/security/tenant-context";
import {
  ConsumptionPlanInvalid, parseConsumptionPlanDraft,
  type ConsumptionPlanDraft,
} from "@/domain/billing/assistant-consumption-plan";
import { db } from "@/infrastructure/db/client";
import { assistantPlanRevisions } from "@/infrastructure/db/assistant-plan-schema";
import { productDefinitions } from "@/infrastructure/db/platform-schema";

export class AssistantPlanAuthorityDenied extends Error {
  constructor(message = "plans.fm_authority_required") { super(message); }
}

export function requireFMPlanAuthority(context: TenantContext, write: boolean): void {
  const corporate = process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID;
  if (!corporate || context.tenantId !== corporate || !["owner", "admin"].includes(context.role)) {
    throw new AssistantPlanAuthorityDenied();
  }
  requirePermission(context, write ? "commercial:write" : "commercial:read");
}

export type AssistantPlanCatalogView = {
  id: string; productId: string; planCode: string; revision: number;
  label: string; billingInterval: string; amountMinor: number; currency: "BRL";
  allowances: ConsumptionPlanDraft["allowances"];
  status: string; publishedAt: Date | null; createdAt: Date;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function checkProductId(productId: string) {
  if (!UUID.test(productId)) throw new ConsumptionPlanInvalid("product_invalid");
}

export class AssistantPlanCatalogService {
  async list(context: TenantContext, productId: string): Promise<AssistantPlanCatalogView[]> {
    requireFMPlanAuthority(context, false);
    checkProductId(productId);
    const rows = await db.select().from(assistantPlanRevisions).where(and(
      eq(assistantPlanRevisions.tenantId, context.tenantId),
      eq(assistantPlanRevisions.productId, productId),
    )).orderBy(desc(assistantPlanRevisions.createdAt));
    return rows.map(row=>({...row,currency:"BRL" as const}));
  }

  async createDraft(context: TenantContext, productId: string, raw: unknown) {
    requireFMPlanAuthority(context, true);
    checkProductId(productId);
    const input = parseConsumptionPlanDraft(raw);
    return db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${[
        "fmcc.assistant.plans.v1",context.tenantId,productId,input.planCode,
      ].join(":")}, 0))`);
      const [product] = await tx.select({id:productDefinitions.id})
        .from(productDefinitions).where(and(
          eq(productDefinitions.tenantId,context.tenantId),
          eq(productDefinitions.id,productId),
          eq(productDefinitions.status,"active"),
        )).limit(1);
      if (!product) throw new AssistantPlanAuthorityDenied("plans.product_unavailable");
      const [last] = await tx.select({revision:assistantPlanRevisions.revision})
        .from(assistantPlanRevisions).where(and(
          eq(assistantPlanRevisions.tenantId,context.tenantId),
          eq(assistantPlanRevisions.productId,productId),
          eq(assistantPlanRevisions.planCode,input.planCode),
        )).orderBy(desc(assistantPlanRevisions.revision)).limit(1);
      const revision=(last?.revision ?? 0)+1;
      const [row] = await tx.insert(assistantPlanRevisions).values({
        tenantId:context.tenantId,productId,planCode:input.planCode,
        revision,label:input.label,billingInterval:input.billingInterval,
        amountMinor:input.amountMinor,allowances:[...input.allowances],
        status:"draft",actorId:context.userId,
      }).returning();
      return {...row,currency:"BRL" as const};
    });
  }

  async publish(context:TenantContext,productId:string,revisionId:string) {
    requireFMPlanAuthority(context,true);
    checkProductId(productId);
    if (!UUID.test(revisionId)) throw new ConsumptionPlanInvalid("revision_invalid");
    return db.transaction(async tx=>{
      const [row]=await tx.select().from(assistantPlanRevisions).where(and(
        eq(assistantPlanRevisions.id,revisionId),
        eq(assistantPlanRevisions.productId,productId),
        eq(assistantPlanRevisions.tenantId,context.tenantId),
      )).for("update").limit(1);
      if (!row || row.status!=="draft")
        throw new AssistantPlanAuthorityDenied("plans.revision_not_draft");
      // Enforce immutable, complete quota coverage again at publishing time.
      parseConsumptionPlanDraft({
        planCode:row.planCode,label:row.label,
        billingInterval:row.billingInterval,amountMinor:row.amountMinor,
        allowances:row.allowances,
      });
      const [published]=await tx.update(assistantPlanRevisions).set({
        status:"published",publishedAt:new Date(),
      }).where(eq(assistantPlanRevisions.id,revisionId)).returning();
      return {...published,currency:"BRL" as const};
    });
  }
}
