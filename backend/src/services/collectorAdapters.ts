export const COLLECTOR_ADAPTERS = ['accesstrade', 'csv'] as const;

export type CollectorAdapter = typeof COLLECTOR_ADAPTERS[number];

export function isCollectorAdapter(value: unknown): value is CollectorAdapter {
  return typeof value === 'string' && COLLECTOR_ADAPTERS.some((adapter) => adapter === value);
}
