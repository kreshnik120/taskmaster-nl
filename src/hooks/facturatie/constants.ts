export const FACTURATIE_QUERY_KEYS = {
  facturen: ['facturen'] as const,
  factuur: (id: string) => ['factuur', id] as const,
  stats: ['factuur-stats'] as const,
};

export const STALE_TIME_MS = 5 * 60 * 1000; // 5 minuten
export const REALTIME_DEBOUNCE_MS = 200;
