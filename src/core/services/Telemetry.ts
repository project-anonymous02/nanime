/** In-memory, privacy-safe performance samples. Never stores queries, URLs, IDs, or credentials. */
export type ClientMetricName = 'search' | 'search-first-result' | 'playback-resolution' | 'detail-load';
export interface ClientMetric { name: ClientMetricName; durationMs: number; ok: boolean; count?: number; at: number }
const samples: ClientMetric[] = [];

export function recordClientMetric(metric: Omit<ClientMetric, 'at'>): void {
  samples.push({ ...metric, durationMs: Math.max(0, Math.round(metric.durationMs)), at: Date.now() });
  if (samples.length > 300) samples.splice(0, samples.length - 300);
}

export function clientMetrics(): ClientMetric[] { return samples.slice(); }
