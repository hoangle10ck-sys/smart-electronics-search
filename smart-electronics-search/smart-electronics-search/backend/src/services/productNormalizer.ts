import { normalize } from '../utils/text';

export interface NormalizedProductFields {
  normalizedName: string;
  normalizedBrand: string | null;
  normalizedModel: string | null;
  normalizedModelNumber: string | null;
  normalizedSku: string | null;
  aliases: string[];
  normalizedSpecs: Record<string, number | string>;
}

type ProductLike = Record<string, any>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalized(value: unknown): string | null {
  const text = clean(value);
  return text ? normalize(text) || null : null;
}

function numericCapacity(value: unknown, defaultUnit: 'gb' | 'tb' = 'gb'): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value * (defaultUnit === 'tb' ? 1024 : 1));
  }
  if (typeof value !== 'string') return undefined;
  const text = value.trim().toLowerCase().replace(',', '.');
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(tb|gb|mb)?(?:\s|$)/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = (match[2] || defaultUnit).toLowerCase();
  const result = unit === 'tb' ? amount * 1024 : unit === 'mb' ? amount / 1024 : amount;
  return Number.isFinite(result) && result > 0 ? Math.round(result) : undefined;
}

function lookup(sources: Record<string, unknown>[], names: string[]): unknown {
  const wanted = new Set(names.map(normalize));
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (wanted.has(normalize(key)) && value !== null && value !== undefined && value !== '') return value;
    }
  }
  return undefined;
}

function positiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(value)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function normalizedSpecs(product: ProductLike): Record<string, number | string> {
  const specs = record(product.specs);
  const raw = record(product.specifications);
  const sources = [specs, raw];
  const result: Record<string, number | string> = {};

  const ramValue = lookup(sources, ['ram', 'memory', 'system memory', 'installed memory']);
  const ramOptions = typeof ramValue === 'string' ? [...ramValue.matchAll(/\d+(?:\.\d+)?\s*gb/gi)] : [];
  const configurableRam = ramOptions.length > 1 && /\bor\b|\/|,|configurable/i.test(String(ramValue));
  const ramGB = configurableRam ? undefined : positiveNumber(ramValue) ?? numericCapacity(ramValue);
  if (ramGB && ramGB <= 2048) result.ramGB = ramGB;

  const storageValue = lookup(sources, ['storage', 'storage capacity', 'ssd', 'ssd capacity', 'disk size', 'internal storage', 'storage gb']);
  const storageGB = numericCapacity(storageValue) ?? positiveNumber(storageValue);
  if (storageGB && storageGB <= 1_000_000) result.storageGB = storageGB;
  const storageTypeValue = lookup(sources, ['storage type', 'drive type', 'storage technology']);
  const storageTypeText = normalize([storageTypeValue, typeof storageValue === 'string' ? storageValue : null].filter(Boolean).join(' '));
  if (/\b(ssd|nvme|solid state drive)\b/.test(storageTypeText)) result.storageType = 'ssd';
  else if (/\b(hdd|hard disk drive)\b/.test(storageTypeText)) result.storageType = 'hdd';

  const vramValue = lookup(sources, ['vram', 'graphics memory', 'gpu memory', 'video memory', 'dedicated video memory']);
  const vramGB = positiveNumber(vramValue) ?? numericCapacity(vramValue);
  if (vramGB && vramGB <= 256) result.vramGB = vramGB;

  const cpu = lookup(sources, ['cpu', 'processor', 'processor model']);
  if (typeof cpu === 'string' && cpu.trim()) result.cpuModel = cpu.trim();
  const gpu = lookup(sources, ['gpu', 'graphics', 'graphics processor', 'graphics card']);
  if (typeof gpu === 'string' && gpu.trim()) result.gpuModel = gpu.trim();

  const screen = lookup(sources, ['screen', 'screen size', 'display size', 'display']);
  const screenMatch = typeof screen === 'string' ? screen.match(/(\d+(?:\.\d+)?)\s*(?:inch|in|\")?/i) : null;
  const screenInches = positiveNumber(screen) ?? (screenMatch ? Number(screenMatch[1]) : undefined);
  if (screenInches && screenInches >= 3 && screenInches <= 100) result.displayInches = screenInches;

  const refresh = lookup(sources, ['refresh rate', 'refresh rate hz', 'screen refresh rate']);
  const hzMatch = typeof refresh === 'string' ? refresh.match(/(\d+(?:\.\d+)?)\s*hz/i) : null;
  const refreshHz = positiveNumber(refresh) ?? (hzMatch ? Number(hzMatch[1]) : undefined);
  if (refreshHz && refreshHz <= 1000) result.refreshRateHz = refreshHz;
  return result;
}

export function normalizeProduct(product: ProductLike): NormalizedProductFields {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const rawAliases = Array.isArray(product.aliases) ? product.aliases : [];
  const aliases = [
    ...rawAliases,
    product.model,
    product.modelNumber,
    product.sku,
    ...variants.flatMap((variant: ProductLike) => [variant?.name, variant?.modelNumber, variant?.sku]),
  ].map(normalized).filter((value): value is string => !!value);
  const uniqueAliases = [...new Set(aliases)];
  const model = clean(product.model) ?? clean(product.modelNumber);
  const modelNumber = clean(product.modelNumber);
  const sku = clean(product.sku);
  const name = clean(product.name) ?? '';
  return {
    normalizedName: normalize(name),
    normalizedBrand: normalized(product.brand),
    normalizedModel: normalized(model),
    normalizedModelNumber: normalized(modelNumber),
    normalizedSku: normalized(sku),
    aliases: uniqueAliases,
    normalizedSpecs: normalizedSpecs(product),
  };
}
