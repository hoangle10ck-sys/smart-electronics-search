/** Convert RAM text to a numeric installed capacity only when the wording is unambiguous. */
export function normalizeSpecs(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const specs: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  if (typeof specs.ram !== 'string') return specs;

  const raw = specs.ram.trim();
  const installedAndMax = raw.match(/^(\d+(?:\.\d+)?)\s*gb\s+soldered,\s*up to\s*(\d+(?:\.\d+)?)\s*gb$/i);
  if (installedAndMax) {
    specs.ram = Number(installedAndMax[1]);
    specs.ramMaxGB = Number(installedAndMax[2]);
    delete specs.ramVariantsGB;
    return specs;
  }

  const installed = raw.match(/^(\d+(?:\.\d+)?)\s*(?:gb)?(?:\s+(?:base|installed|soldered))?$/i);
  if (installed) {
    specs.ram = Number(installed[1]);
    delete specs.ramVariantsGB;
    return specs;
  }

  const maximum = raw.match(/^up to\s*(\d+(?:\.\d+)?)\s*gb$/i);
  if (maximum) {
    delete specs.ram;
    specs.ramMaxGB = Number(maximum[1]);
    delete specs.ramVariantsGB;
    return specs;
  }

  const options = [...raw.matchAll(/(\d+(?:\.\d+)?)\s*gb/gi)].map((match) => Number(match[1]));
  if (options.length > 1 && /\bor\b|\/|,|\bconfigurable\b/i.test(raw)) {
    delete specs.ram;
    specs.ramVariantsGB = [...new Set(options)].sort((a, b) => a - b).join(' / ');
  }

  return specs;
}
