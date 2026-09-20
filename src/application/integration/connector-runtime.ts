import type { CanonicalFactRepository, Connector, SourceRepository, SyncRepository } from "@/domain/integration/contracts";
import type { TenantContext } from "@/domain/security/tenant-context";
import { CrossTenantAccessError } from "@/domain/security/tenant-context";

export class ConnectorNotRegisteredError extends Error {
  constructor(sourceType: string) { super(`integration.connector_not_registered:${sourceType}`); }
}
export class ConnectorUnsupportedModeError extends Error {
  constructor() { super("integration.connector_pull_not_supported"); }
}
export class ConnectorTimeoutError extends Error {
  constructor() { super("integration.connector_timeout"); }
}

export class ConnectorRuntime {
  private readonly connectors = new Map<string, Connector>();

  constructor(
    private readonly sources: SourceRepository,
    private readonly syncs: SyncRepository,
    private readonly facts: CanonicalFactRepository,
    connectors: readonly Connector[],
    private readonly timeoutMs = 8_000,
  ) {
    for (const connector of connectors) this.connectors.set(connector.sourceType, connector);
  }

  async syncPull(context: TenantContext, input: { sourceId: string; cursor?: string; idempotencyKey: string }) {
    const source = await this.sources.findById(context.tenantId, input.sourceId);
    if (!source) throw new CrossTenantAccessError();
    if (source.tenantId !== context.tenantId) throw new CrossTenantAccessError();

    const completed = await this.syncs.findCompletedByIdempotencyKey(context.tenantId, input.idempotencyKey);
    if (completed) return { status: "duplicate" as const, executionId: completed.id, ingested: 0 };

    const connector = this.connectors.get(source.sourceType);
    if (!connector) throw new ConnectorNotRegisteredError(source.sourceType);
    if (!connector.pull) throw new ConnectorUnsupportedModeError();

    const executionId = await this.syncs.start({
      tenantId: context.tenantId, sourceId: source.id, idempotencyKey: input.idempotencyKey,
      correlationId: context.correlationId, cursorBefore: input.cursor,
    });

    try {
      const result = await this.withTimeout(connector.pull({
        tenantId: context.tenantId, correlationId: context.correlationId, timeoutMs: this.timeoutMs,
      }, source, input.cursor));

      for (const fact of result.facts) {
        await this.facts.ingest({
          tenantId: context.tenantId, sourceId: source.id, mappingVersion: source.mappingVersion,
          fact, correlationId: context.correlationId,
        });
      }
      await this.syncs.complete({ id: executionId, tenantId: context.tenantId, cursorAfter: result.nextCursor });
      return { status: "completed" as const, executionId, ingested: result.facts.length, nextCursor: result.nextCursor };
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error("integration.unknown_error");
      await this.syncs.fail({ id: executionId, tenantId: context.tenantId, errorCode: normalized.name, errorMessage: normalized.message });
      throw error;
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ConnectorTimeoutError()), this.timeoutMs); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
