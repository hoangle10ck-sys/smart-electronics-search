export type CompatibilityStatus = 'COMPATIBLE' | 'INCOMPATIBLE' | 'UNKNOWN';

export type CompatibilityPair =
  | 'cpu_motherboard'
  | 'ram_motherboard'
  | 'gpu_psu'
  | 'gpu_case'
  | 'motherboard_case';

export interface CompatibilityProductInput {
  _id?: unknown;
  name: string;
  category: string;
  brand?: string | null;
  specs?: Record<string, unknown> | null;
  specifications?: Record<string, unknown> | null;
  normalizedSpecs?: Record<string, unknown> | null;
}

export interface CompatibilityCheckResult {
  pair: CompatibilityPair;
  label: string;
  status: CompatibilityStatus;
  reason: string;
  details: {
    leftProduct?: string;
    rightProduct?: string;
    leftValue?: string | number | null;
    rightValue?: string | number | null;
  };
}

export interface OverallCompatibilityReport {
  overallStatus: CompatibilityStatus;
  checks: CompatibilityCheckResult[];
  summary: string;
}

function collectTextFields(product: CompatibilityProductInput): string {
  const parts: string[] = [product.name];
  for (const source of [product.normalizedSpecs, product.specs, product.specifications]) {
    if (!source || typeof source !== 'object') continue;
    for (const [k, v] of Object.entries(source)) {
      if (v != null && (typeof v === 'string' || typeof v === 'number')) {
        parts.push(`${k}: ${String(v)}`);
      }
    }
  }
  return parts.join(' | ');
}

function lookupField(product: CompatibilityProductInput, keys: string[]): string | number | null {
  const lowered = keys.map((k) => k.toLowerCase());
  for (const source of [product.normalizedSpecs, product.specs, product.specifications]) {
    if (!source || typeof source !== 'object') continue;
    for (const [k, v] of Object.entries(source)) {
      if (lowered.includes(k.toLowerCase()) && v != null && v !== '') {
        if (typeof v === 'string' || typeof v === 'number') return v;
      }
    }
  }
  return null;
}

export function extractSocket(product: CompatibilityProductInput): string | null {
  const direct = lookupField(product, ['socket', 'cpu_socket', 'cpu socket', 'chân cắm']);
  const text = direct != null ? String(direct) : collectTextFields(product);
  const match = text.match(/\b(LGA\s*\d{3,4}|AM[45]|TR4|sTRX4|FM2\+?)\b/i);
  return match ? match[1].replace(/\s+/g, '').toUpperCase() : null;
}

export function extractSystemMemoryTypes(product: CompatibilityProductInput): string[] {
  const direct = lookupField(product, ['memoryType', 'memory_type', 'ramType', 'ram_type', 'chuẩn ram', 'loại ram', 'memory']);
  const text = direct != null ? String(direct) : collectTextFields(product);
  const matches = text.match(/\bDDR[345]\b/gi);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.toUpperCase()))];
}

export function extractPsuWatts(product: CompatibilityProductInput): number | null {
  const direct = lookupField(product, ['powerWatts', 'wattage', 'power', 'công suất', 'psu_watts']);
  if (typeof direct === 'number' && direct >= 100 && direct <= 3000) return direct;
  const text = direct != null ? String(direct) : collectTextFields(product);
  const match = text.match(/\b(\d{3,4})\s*W(?:att)?\b/i);
  if (!match) return null;
  const watts = Number(match[1]);
  return watts >= 100 && watts <= 3000 ? watts : null;
}

export function extractRecommendedPsuWatts(product: CompatibilityProductInput): number | null {
  const direct = lookupField(product, [
    'recommendedPsuWatts', 'recommended_psu', 'recommendedPsu', 'psuRequirement', 'nguồn khuyến nghị', 'psu khuyến nghị',
  ]);
  if (typeof direct === 'number' && direct >= 200 && direct <= 2500) return direct;
  const text = direct != null ? String(direct) : collectTextFields(product);
  const match = text.match(/(?:recommended\s*psu|nguồn\s*khuyến\s*nghị|psu\s*khuyến\s*nghị)[^0-9]{0,20}(\d{3,4})\s*W/i);
  if (!match) return null;
  const watts = Number(match[1]);
  return watts >= 200 && watts <= 2500 ? watts : null;
}

export function extractGpuLengthMm(product: CompatibilityProductInput): number | null {
  const direct = lookupField(product, ['lengthMm', 'gpuLengthMm', 'length', 'chiều dài', 'dimensions']);
  if (typeof direct === 'number' && direct >= 80 && direct <= 500) return direct;
  const text = direct != null ? String(direct) : collectTextFields(product);
  const match = text.match(/(?:length|chiều\s*dài)[^0-9]{0,15}(\d{3}(?:\.\d+)?)\s*mm/i)
    ?? text.match(/\b(\d{3}(?:\.\d+)?)\s*mm\b/i);
  if (!match) return null;
  const mm = Number(match[1]);
  return mm >= 80 && mm <= 500 ? mm : null;
}

export function extractCaseMaxGpuLengthMm(product: CompatibilityProductInput): number | null {
  const direct = lookupField(product, ['maxGpuLengthMm', 'max_gpu_length', 'gpuMaxLength', 'chiều dài gpu tối đa']);
  if (typeof direct === 'number' && direct >= 150 && direct <= 600) return direct;
  const text = direct != null ? String(direct) : collectTextFields(product);
  const match = text.match(/(?:max\s*gpu|gpu\s*max|vga\s*tối\s*đa|gpu\s*tối\s*đa|chiều\s*dài\s*gpu)[^0-9]{0,20}(\d{3}(?:\.\d+)?)\s*mm/i);
  if (!match) return null;
  const mm = Number(match[1]);
  return mm >= 150 && mm <= 600 ? mm : null;
}

function normalizeFormFactorToken(token: string): string {
  const upper = token.trim().toUpperCase();
  if (upper === 'MATX' || upper === 'M-ATX' || upper === 'MICRO-ATX' || upper === 'MICRO ATX') return 'MICRO-ATX';
  if (upper === 'ITX' || upper === 'MINI-ITX' || upper === 'MINI ITX') return 'MINI-ITX';
  if (upper === 'EATX' || upper === 'E-ATX') return 'E-ATX';
  return upper;
}

export function extractFormFactors(product: CompatibilityProductInput): string[] {
  const direct = lookupField(product, ['formFactor', 'form_factor', 'kích cỡ', 'chuẩn mainboard', 'supportedFormFactors']);
  const text = direct != null ? String(direct) : collectTextFields(product);
  const matches = text.match(/\b(E-ATX|EATX|Micro-ATX|Micro\s+ATX|mATX|M-ATX|Mini-ITX|Mini\s+ITX|ATX|ITX)\b/gi);
  if (!matches) return [];
  return [...new Set(matches.map(normalizeFormFactorToken))];
}

const ATX_HIERARCHY: Record<string, string[]> = {
  'E-ATX': ['E-ATX', 'ATX', 'MICRO-ATX', 'MINI-ITX'],
  'ATX': ['ATX', 'MICRO-ATX', 'MINI-ITX'],
  'MICRO-ATX': ['MICRO-ATX', 'MINI-ITX'],
  'MINI-ITX': ['MINI-ITX'],
};

export function checkHardwareCompatibility(products: CompatibilityProductInput[]): OverallCompatibilityReport {
  const cpus = products.filter((p) => p.category === 'cpu');
  const motherboards = products.filter((p) => p.category === 'motherboard');
  const rams = products.filter((p) => p.category === 'ram');
  const gpus = products.filter((p) => p.category === 'gpu');
  const psus = products.filter((p) => p.category === 'power_supply');
  const cases = products.filter((p) => p.category === 'pc_case');

  const checks: CompatibilityCheckResult[] = [];

  for (const cpu of cpus) {
    for (const mb of motherboards) {
      const cpuSocket = extractSocket(cpu);
      const mbSocket = extractSocket(mb);
      if (!cpuSocket || !mbSocket) {
        checks.push({
          pair: 'cpu_motherboard',
          label: 'CPU ↔ Mainboard (Socket)',
          status: 'UNKNOWN',
          reason: 'Thiếu thông số socket ở CPU hoặc Mainboard để xác minh tương thích.',
          details: { leftProduct: cpu.name, rightProduct: mb.name, leftValue: cpuSocket, rightValue: mbSocket },
        });
      } else if (cpuSocket === mbSocket) {
        checks.push({
          pair: 'cpu_motherboard',
          label: 'CPU ↔ Mainboard (Socket)',
          status: 'COMPATIBLE',
          reason: `Cùng chuẩn socket ${cpuSocket}.`,
          details: { leftProduct: cpu.name, rightProduct: mb.name, leftValue: cpuSocket, rightValue: mbSocket },
        });
      } else {
        checks.push({
          pair: 'cpu_motherboard',
          label: 'CPU ↔ Mainboard (Socket)',
          status: 'INCOMPATIBLE',
          reason: `Socket CPU (${cpuSocket}) không khớp với socket Mainboard (${mbSocket}).`,
          details: { leftProduct: cpu.name, rightProduct: mb.name, leftValue: cpuSocket, rightValue: mbSocket },
        });
      }
    }
  }

  for (const ram of rams) {
    for (const mb of motherboards) {
      const ramTypes = extractSystemMemoryTypes(ram);
      const mbTypes = extractSystemMemoryTypes(mb);
      if (!ramTypes.length || !mbTypes.length) {
        checks.push({
          pair: 'ram_motherboard',
          label: 'RAM ↔ Mainboard (Chuẩn DDR)',
          status: 'UNKNOWN',
          reason: 'Thiếu thông số chuẩn DDR (DDR4/DDR5) ở RAM hoặc Mainboard.',
          details: { leftProduct: ram.name, rightProduct: mb.name, leftValue: ramTypes.join('/') || null, rightValue: mbTypes.join('/') || null },
        });
      } else if (ramTypes.some((t) => mbTypes.includes(t))) {
        const matched = ramTypes.filter((t) => mbTypes.includes(t)).join('/');
        checks.push({
          pair: 'ram_motherboard',
          label: 'RAM ↔ Mainboard (Chuẩn DDR)',
          status: 'COMPATIBLE',
          reason: `Mainboard hỗ trợ chuẩn bộ nhớ ${matched}.`,
          details: { leftProduct: ram.name, rightProduct: mb.name, leftValue: ramTypes.join('/'), rightValue: mbTypes.join('/') },
        });
      } else {
        checks.push({
          pair: 'ram_motherboard',
          label: 'RAM ↔ Mainboard (Chuẩn DDR)',
          status: 'INCOMPATIBLE',
          reason: `RAM chuẩn ${ramTypes.join('/')} không tương thích với Mainboard hỗ trợ ${mbTypes.join('/')}.`,
          details: { leftProduct: ram.name, rightProduct: mb.name, leftValue: ramTypes.join('/'), rightValue: mbTypes.join('/') },
        });
      }
    }
  }

  for (const gpu of gpus) {
    for (const psu of psus) {
      const reqWatts = extractRecommendedPsuWatts(gpu);
      const psuWatts = extractPsuWatts(psu);
      if (!reqWatts || !psuWatts) {
        checks.push({
          pair: 'gpu_psu',
          label: 'GPU ↔ Nguồn (Công suất PSU)',
          status: 'UNKNOWN',
          reason: 'Thiếu thông số công suất PSU khuyến nghị của GPU hoặc công suất thực của nguồn.',
          details: { leftProduct: gpu.name, rightProduct: psu.name, leftValue: reqWatts, rightValue: psuWatts },
        });
      } else if (psuWatts >= reqWatts) {
        checks.push({
          pair: 'gpu_psu',
          label: 'GPU ↔ Nguồn (Công suất PSU)',
          status: 'COMPATIBLE',
          reason: `Nguồn ${psuWatts}W đáp ứng mức khuyến nghị ${reqWatts}W của GPU.`,
          details: { leftProduct: gpu.name, rightProduct: psu.name, leftValue: `${reqWatts}W`, rightValue: `${psuWatts}W` },
        });
      } else {
        checks.push({
          pair: 'gpu_psu',
          label: 'GPU ↔ Nguồn (Công suất PSU)',
          status: 'INCOMPATIBLE',
          reason: `Nguồn ${psuWatts}W thấp hơn mức khuyến nghị ${reqWatts}W của GPU.`,
          details: { leftProduct: gpu.name, rightProduct: psu.name, leftValue: `${reqWatts}W`, rightValue: `${psuWatts}W` },
        });
      }
    }

    for (const pcCase of cases) {
      const gpuLen = extractGpuLengthMm(gpu);
      const maxLen = extractCaseMaxGpuLengthMm(pcCase);
      if (!gpuLen || !maxLen) {
        checks.push({
          pair: 'gpu_case',
          label: 'GPU ↔ Vỏ case (Chiều dài)',
          status: 'UNKNOWN',
          reason: 'Thiếu thông số chiều dài GPU hoặc khoảng trống GPU tối đa của vỏ case.',
          details: { leftProduct: gpu.name, rightProduct: pcCase.name, leftValue: gpuLen, rightValue: maxLen },
        });
      } else if (gpuLen <= maxLen) {
        checks.push({
          pair: 'gpu_case',
          label: 'GPU ↔ Vỏ case (Chiều dài)',
          status: 'COMPATIBLE',
          reason: `GPU dài ${gpuLen}mm lắp vừa vỏ case (tối đa ${maxLen}mm).`,
          details: { leftProduct: gpu.name, rightProduct: pcCase.name, leftValue: `${gpuLen}mm`, rightValue: `${maxLen}mm` },
        });
      } else {
        checks.push({
          pair: 'gpu_case',
          label: 'GPU ↔ Vỏ case (Chiều dài)',
          status: 'INCOMPATIBLE',
          reason: `GPU dài ${gpuLen}mm vượt quá giới hạn ${maxLen}mm của vỏ case.`,
          details: { leftProduct: gpu.name, rightProduct: pcCase.name, leftValue: `${gpuLen}mm`, rightValue: `${maxLen}mm` },
        });
      }
    }
  }

  for (const mb of motherboards) {
    for (const pcCase of cases) {
      const mbFormats = extractFormFactors(mb);
      const caseFormats = extractFormFactors(pcCase);
      if (!mbFormats.length || !caseFormats.length) {
        checks.push({
          pair: 'motherboard_case',
          label: 'Mainboard ↔ Vỏ case (Form Factor)',
          status: 'UNKNOWN',
          reason: 'Thiếu thông số kích cỡ (ATX/Micro-ATX/Mini-ITX) ở Mainboard hoặc vỏ case.',
          details: { leftProduct: mb.name, rightProduct: pcCase.name, leftValue: mbFormats.join('/') || null, rightValue: caseFormats.join('/') || null },
        });
      } else {
        const supportedByCase = new Set(caseFormats.flatMap((fmt) => ATX_HIERARCHY[fmt] ?? [fmt]));
        const mbFormat = mbFormats[0];
        if (supportedByCase.has(mbFormat)) {
          checks.push({
            pair: 'motherboard_case',
            label: 'Mainboard ↔ Vỏ case (Form Factor)',
            status: 'COMPATIBLE',
            reason: `Vỏ case (${caseFormats.join('/')}) hỗ trợ chuẩn Mainboard ${mbFormat}.`,
            details: { leftProduct: mb.name, rightProduct: pcCase.name, leftValue: mbFormat, rightValue: caseFormats.join('/') },
          });
        } else {
          checks.push({
            pair: 'motherboard_case',
            label: 'Mainboard ↔ Vỏ case (Form Factor)',
            status: 'INCOMPATIBLE',
            reason: `Vỏ case (${caseFormats.join('/')}) không hỗ trợ chuẩn Mainboard ${mbFormat}.`,
            details: { leftProduct: mb.name, rightProduct: pcCase.name, leftValue: mbFormat, rightValue: caseFormats.join('/') },
          });
        }
      }
    }
  }

  if (!checks.length) {
    return {
      overallStatus: 'UNKNOWN',
      checks: [],
      summary: 'Chưa có cặp linh kiện PC phù hợp (CPU/Mainboard/RAM/GPU/PSU/Case) để kiểm tra tương thích.',
    };
  }

  const hasIncompatible = checks.some((c) => c.status === 'INCOMPATIBLE');
  const hasUnknown = checks.some((c) => c.status === 'UNKNOWN');
  const overallStatus: CompatibilityStatus = hasIncompatible ? 'INCOMPATIBLE' : hasUnknown ? 'UNKNOWN' : 'COMPATIBLE';
  const summary = overallStatus === 'COMPATIBLE'
    ? `Tất cả ${checks.length} cặp kiểm tra đều tương thích.`
    : overallStatus === 'INCOMPATIBLE'
      ? `Phát hiện ${checks.filter((c) => c.status === 'INCOMPATIBLE').length} vấn đề không tương thích.`
      : `Có ${checks.filter((c) => c.status === 'UNKNOWN').length} cặp kiểm tra thiếu thông số kỹ thuật (UNKNOWN).`;

  return { overallStatus, checks, summary };
}
