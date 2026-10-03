export interface ActivityRecord {
  readonly id: string;
  readonly actorId: string;
  readonly actorType: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly result: string;
  readonly correlationId: string;
  readonly occurredAt: Date;
}

export interface ActivityRepository {
  recent(
    tenantId: string,
    limit: number,
  ): Promise<readonly ActivityRecord[]>;
}

export interface ActivityFeedItem {
  readonly id: string;
  readonly actorId: string;
  readonly actorType: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly result: string;
  readonly correlationId: string;
  readonly occurredAt: string;
}

export interface ActivityFeedOverview {
  readonly items: readonly ActivityFeedItem[];
  readonly windowNote: string;
  readonly dataBoundary: string;
}
