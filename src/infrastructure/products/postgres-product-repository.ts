import { and, eq } from "drizzle-orm";
import type { NewProductDefinition, ProductDefinition, ProductRepository } from "@/domain/products/contracts";
import { db } from "@/infrastructure/db/client";
import { productDefinitions } from "@/infrastructure/db/platform-schema";

function mapProduct(row: typeof productDefinitions.$inferSelect): ProductDefinition {
  return {
    id: row.id, tenantId: row.tenantId, slug: row.slug, name: row.name,
    status: row.status === "inactive" ? "inactive" : "active",
  };
}

const REFERENCE_PRODUCTS: readonly ProductDefinition[] = [
  { id: "ref-kordena", tenantId: "fm-command-reference-tenant", slug: "kordena", name: "Kordena", status: "active" },
  { id: "ref-iron", tenantId: "fm-command-reference-tenant", slug: "iron", name: "IRON", status: "active" },
  { id: "ref-campaia", tenantId: "fm-command-reference-tenant", slug: "campaia", name: "CampaIA", status: "active" },
];

function referenceMode(): boolean {
  return process.env.FMCC_REFERENCE_MODE === "pr31";
}

export class PostgresProductRepository implements ProductRepository {
  async findById(tenantId: string, productId: string): Promise<ProductDefinition | null> {
    if (referenceMode()) return REFERENCE_PRODUCTS.find((item) => item.tenantId === tenantId && item.id === productId) ?? null;
    const rows = await db.select().from(productDefinitions).where(and(
      eq(productDefinitions.tenantId, tenantId), eq(productDefinitions.id, productId),
    )).limit(1);
    return rows[0] ? mapProduct(rows[0]) : null;
  }
  async findBySlug(tenantId: string, slug: string): Promise<ProductDefinition | null> {
    if (referenceMode()) return REFERENCE_PRODUCTS.find((item) => item.tenantId === tenantId && item.slug === slug) ?? null;
    const rows = await db.select().from(productDefinitions).where(and(
      eq(productDefinitions.tenantId, tenantId), eq(productDefinitions.slug, slug),
    )).limit(1);
    return rows[0] ? mapProduct(rows[0]) : null;
  }
  async list(tenantId: string): Promise<readonly ProductDefinition[]> {
    if (referenceMode()) return REFERENCE_PRODUCTS.filter((item) => item.tenantId === tenantId);
    const rows = await db.select().from(productDefinitions).where(eq(productDefinitions.tenantId, tenantId));
    return rows.map(mapProduct);
  }
  async create(tenantId: string, input: NewProductDefinition): Promise<ProductDefinition> {
    if (referenceMode()) throw new Error("reference_mode.read_only");
    const rows = await db.insert(productDefinitions).values({
      tenantId, slug: input.slug, name: input.name, status: input.status ?? "active",
    }).returning();
    return mapProduct(rows[0]);
  }
}
