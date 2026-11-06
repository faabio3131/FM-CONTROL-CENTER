/** Port V2: token de mudança opaco; ausência de fonte não é dado zero. */
export interface PulseParts {
  readonly metricsLatest: number | null;
  readonly auditLatest: number | null;
}
export const LIVE_POLL_MS = 5_000;
export const LIVE_MAX_BACKOFF_MS = 60_000;
export function pulseSource(parts: PulseParts): string {
  return `m:${parts.metricsLatest ?? "-"}|a:${parts.auditLatest ?? "-"}`;
}
export function shouldRefresh(previous: string | null, next: string): boolean {
  return previous !== null && previous !== next;
}
export function nextDelayMs(failures: number): number {
  if (failures <= 0) return LIVE_POLL_MS;
  return Math.min(LIVE_MAX_BACKOFF_MS, LIVE_POLL_MS * 2 ** Math.min(failures, 12));
}
