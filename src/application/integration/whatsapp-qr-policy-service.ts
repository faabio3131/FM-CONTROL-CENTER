import { and, eq, sql } from "drizzle-orm";
import type { TenantContext } from "@/domain/security/tenant-context";
import { requireFMPlanAuthority, VENDEATENDEIA_PRODUCT_SLUG } from "@/application/billing/assistant-plan-catalog-service";
import { db } from "@/infrastructure/db/client";
import { productDefinitions } from "@/infrastructure/db/platform-schema";
import {
  whatsappQRDisplayPolicies,
  whatsappQRDisplayPolicyAudit,
} from "@/infrastructure/db/whatsapp-qr-policy-schema";
import {
  DEFAULT_WHATSAPP_QR_DISPLAY_SECONDS,
  parseWhatsAppQRDisplaySeconds,
} from "@/domain/integration/whatsapp-qr-policy";

export class WhatsAppQRPolicyUnavailable extends Error {}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function assertFMProduct(context: TenantContext, productId: string): Promise<void> {
  if (!UUID.test(productId)) throw new WhatsAppQRPolicyUnavailable("qr.product_invalid");
  const [product] = await db.select({slug: productDefinitions.slug})
    .from(productDefinitions).where(and(
      eq(productDefinitions.tenantId,context.tenantId),
      eq(productDefinitions.id,productId),
      eq(productDefinitions.status,"active"),
    )).limit(1);
  if (product?.slug !== VENDEATENDEIA_PRODUCT_SLUG)
    throw new WhatsAppQRPolicyUnavailable("qr.product_unavailable");
}

export class WhatsAppQRPolicyService {
  async read(context: TenantContext, productId: string) {
    requireFMPlanAuthority(context,false);
    await assertFMProduct(context,productId);
    const [row] = await db.select().from(whatsappQRDisplayPolicies).where(and(
      eq(whatsappQRDisplayPolicies.tenantId,context.tenantId),
      eq(whatsappQRDisplayPolicies.productId,productId),
    )).limit(1);
    return {
      displaySeconds:row?.displaySeconds ?? DEFAULT_WHATSAPP_QR_DISPLAY_SECONDS,
      revision:row?.revision ?? 0,
      source:row ? "fm_command" : "fm_default",
    };
  }

  async update(
    context: TenantContext, productId:string, rawSeconds:unknown,
    expectedRevision: unknown,
  ) {
    requireFMPlanAuthority(context,true);
    const displaySeconds=parseWhatsAppQRDisplaySeconds(rawSeconds);
    if (typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new WhatsAppQRPolicyUnavailable("qr.revision_invalid");
    await assertFMProduct(context,productId);
    return db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${[
        "fmcc.whatsapp.qr.display",context.tenantId,productId,
      ].join(":")},0))`);
      const [old] = await tx.select().from(whatsappQRDisplayPolicies).where(and(
        eq(whatsappQRDisplayPolicies.tenantId,context.tenantId),
        eq(whatsappQRDisplayPolicies.productId,productId),
      )).limit(1);
      if ((old?.revision ?? 0) !== expectedRevision)
        throw new WhatsAppQRPolicyUnavailable("qr.revision_conflict");
      const revision=expectedRevision+1;
      if (old) {
        await tx.update(whatsappQRDisplayPolicies).set({
          displaySeconds,revision,actorId:context.userId,updatedAt:new Date(),
        }).where(eq(whatsappQRDisplayPolicies.id,old.id));
      } else {
        await tx.insert(whatsappQRDisplayPolicies).values({
          tenantId:context.tenantId,productId,displaySeconds,revision,
          actorId:context.userId,
        });
      }
      await tx.insert(whatsappQRDisplayPolicyAudit).values({
        tenantId:context.tenantId,productId,actorId:context.userId,revision,
        previousSeconds:old?.displaySeconds ?? null,displaySeconds,
      });
      return {displaySeconds,revision,source:"fm_command"};
    });
  }
}
