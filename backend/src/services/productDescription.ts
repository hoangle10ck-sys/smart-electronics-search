const FIELD_GROUPS: Array<{ label: string; keys: string[] }> = [
  { label: 'Bộ xử lý', keys: ['chipset', 'chip', 'processor', 'processoroptions', 'cpu', 'soc'] },
  { label: 'Đồ họa', keys: ['gpu', 'graphics', 'graphicsoptions', 'graphicsmodel'] },
  { label: 'Màn hình', keys: ['display', 'displayoptions', 'screen', 'resolution'] },
  { label: 'RAM / bộ nhớ', keys: ['memory', 'memoryoptions', 'ram'] },
  { label: 'Lưu trữ', keys: ['storage', 'storageoptions'] },
  { label: 'Camera', keys: ['camera', 'cameras', 'camerasystem', 'rearcamera', 'frontcamera'] },
  { label: 'Pin', keys: ['battery', 'batterylife', 'batteryoptions'] },
  { label: 'Kết nối', keys: ['connectivity', 'wireless', 'connection', 'ports'] },
  { label: 'Âm thanh', keys: ['audio', 'speakers', 'microphone'] },
  { label: 'Thiết kế', keys: ['formfactor', 'dimensions', 'weight'] },
];

const FALLBACK_LABELS: Record<string, string> = {
  capacity: 'Dung lượng', interface: 'Giao tiếp', sequentialspeed: 'Tốc độ tuần tự',
  sequentialread: 'Tốc độ đọc tuần tự', sequentialwrite: 'Tốc độ ghi tuần tự',
  buttons: 'Số nút', sensor: 'Cảm biến', charging: 'Sạc', compatibility: 'Tương thích',
  refreshRate: 'Tần số quét', responseTime: 'Thời gian phản hồi', dimensions: 'Kích thước',
  weight: 'Trọng lượng', resolution: 'Độ phân giải', storageOptions: 'Tùy chọn lưu trữ',
  memoryOptions: 'Tùy chọn bộ nhớ', processorOptions: 'Tùy chọn bộ xử lý', graphicsOptions: 'Tùy chọn đồ họa',
  displayOptions: 'Tùy chọn màn hình',
};

function renderValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (Array.isArray(value)) {
    const values = value.map(renderValue).filter((item): item is string => Boolean(item));
    return values.length ? values.join(' / ') : null;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/source|url|notes|evidence|reference/i.test(key))
      .map(([key, item]) => `${key}: ${renderValue(item) ?? ''}`)
      .filter((item) => !item.endsWith(': '));
    return entries.length ? entries.slice(0, 4).join('; ') : null;
  }
  return null;
}

/** Creates a short description only from facts already stored in specifications. */
export function buildProductDescription(name: string, specifications: Record<string, unknown> | null | undefined): string | null {
  const specs = specifications && typeof specifications === 'object' ? specifications : {};
  const keys = new Map(Object.entries(specs).map(([key, value]) => [key.toLowerCase(), { key, value }]));
  const facts: string[] = [];
  const used = new Set<string>();
  for (const group of FIELD_GROUPS) {
    for (const key of group.keys) {
      const match = keys.get(key);
      if (!match) continue;
      const value = renderValue(match.value);
      if (value) {
        facts.push(`${group.label}: ${value}`);
        used.add(match.key);
        break;
      }
    }
  }
  if (facts.length < 4) {
    for (const [key, rawValue] of Object.entries(specs)) {
      if (used.has(key) || /source|url|notes|evidence|modelnumber/i.test(key)) continue;
      const value = renderValue(rawValue);
      if (value) facts.push(`${FALLBACK_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2')}: ${value}`);
      if (facts.length >= 6) break;
    }
  }
  if (!facts.length) return null;
  return `Thông tin theo catalog của ${name}: ${facts.slice(0, 6).join('; ')}.`;
}

