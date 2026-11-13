import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { Offer } from '../models/Offer';
import { smartSearch } from '../services/searchService';
import { CATEGORIES, TAGS } from '../services/dictionary';
import { CANONICAL_CATEGORY_KEYS } from '../services/taxonomy';
import { normalize } from '../utils/text';

type EvaluationCase = {
  id: string;
  query: string;
  type: 'exact_model' | 'brand_model' | 'budget' | 'natural_language' | 'no_result';
  relevantProductIds: string[];
  constraints: { brand?: string; category?: string; maxPrice?: number; ram?: number; storageGB?: number; storageType?: string; vramGB?: number; displayInches?: number };
  generatedFrom?: { productId: string; productName: string; source: string };
  expectedBasis?: string;
};

const reportsDir = resolve(process.cwd(), 'reports');
const corpusFile = resolve(reportsDir, 'search-evaluation-corpus.json');

function ramValue(product: any): number | undefined {
  const value = product.specs?.ram ?? product.normalizedSpecs?.ramGB;
  if (typeof value === 'number' && value > 0) return value;
  if (typeof value === 'string') {
    const match = value.match(/^(\d+(?:\.\d+)?)\s*(?:gb)?(?:\s|$)/i);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function capacityValue(value: unknown): number | undefined {
  if (typeof value === 'number' && value > 0) return value;
  if (typeof value !== 'string') return undefined;
  const match = value.match(/(\d+(?:\.\d+)?)\s*(tb|gb)?/i);
  if (!match) return undefined;
  return Math.round(Number(match[1]) * (match[2]?.toLowerCase() === 'tb' ? 1024 : 1));
}

async function generateCorpus(): Promise<EvaluationCase[]> {
  const products = await Product.find({
    source: { $in: ['accesstrade', 'csv', 'curated'] }, verified: true,
    productVerificationStatus: 'verified', urlVerificationStatus: 'verified', publicationStatus: 'published',
    verifiedAt: { $ne: null }, brand: { $type: 'string', $ne: '' }, model: { $type: 'string', $ne: '' },
    category: { $in: CANONICAL_CATEGORY_KEYS },
    $and: [{ $or: [
      { imageVerificationStatus: 'verified', imageUsagePermission: 'granted', imageUrl: { $type: 'string', $ne: '' }, imageSource: { $type: 'string', $ne: '' } },
      { imageVerificationStatus: 'pending', imageUsagePermission: 'not_provided', imageUrl: null },
      ...(process.env.SERVE_LOCAL_ONLY_IMAGES === 'true' || process.env.NODE_ENV !== 'production' ? [{ imageVerificationStatus: 'pending', imageUsagePermission: 'not_provided', localOnlyAsset: true, imageUrl: { $regex: '^/catalog-images/[a-z0-9][a-z0-9._-]*\\.(jpg|jpeg|png|webp)$', $options: 'i' } }] : []),
    ] }],
  }).select('_id name brand model modelNumber category specs normalizedSpecs tags source').sort({ _id: 1 }).lean() as any[];
  const offers = await Offer.find({ verified: true, priceVerificationStatus: { $in: ['verified', null] }, price: { $gt: 0 }, currency: 'VND' }).select('productId price').lean() as any[];
  const bestPrice = new Map<string, number>();
  for (const offer of offers) {
    const key = String(offer.productId);
    if (!bestPrice.has(key) || offer.price < bestPrice.get(key)!) bestPrice.set(key, offer.price);
  }

  const cases: EvaluationCase[] = [];
  for (const product of products) {
    const id = String(product._id);
    const identifier = String(product.modelNumber || product.model || product.name).trim();
    if (!identifier || !product.brand || !product.category) continue;
    const categoryTerm = CATEGORIES[product.category]?.terms[0] ?? product.category;
    const price = bestPrice.get(id);
    const budget = price ? Math.ceil(price * 1.2 / 1_000_000) * 1_000_000 : undefined;
    const ram = ramValue(product);
    const storage = capacityValue(product.normalizedSpecs?.storageGB ?? product.specs?.storage);
    const storageType = product.normalizedSpecs?.storageType as string | undefined;
    const vram = capacityValue(product.normalizedSpecs?.vramGB ?? product.specs?.vram);
    const display = Number(product.normalizedSpecs?.displayInches || 0) || undefined;
    const tags = (product.tags ?? []).filter((tag: string) => TAGS[tag]);
    const useCase = tags.length ? TAGS[tags[0]].terms[0] : undefined;
    const common = { productId: id, productName: product.name, source: product.source };
    const base = `${product.brand} ${categoryTerm} ${identifier}`.trim();
    const variants: Array<Omit<EvaluationCase, 'id' | 'generatedFrom' | 'relevantProductIds'>> = [
      { query: identifier, type: 'exact_model', constraints: {} },
      { query: base, type: 'brand_model', constraints: { brand: product.brand, category: product.category } },
      ...(budget ? [{ query: `${base} dưới ${Math.round(budget / 1_000_000)} triệu`, type: 'budget' as const, constraints: { brand: product.brand, category: product.category, maxPrice: budget } }] : []),
      { query: `Tôi cần ${base}${ram ? ` RAM ${ram}GB` : ''}${storage ? ` ${storageType ? storageType.toUpperCase() : ''} ${storage}GB` : ''}${vram ? ` VRAM ${vram}GB` : ''}${display ? ` ${display} inch` : ''}${useCase ? ` để ${useCase}` : ''}${budget ? ` dưới ${Math.round(budget / 1_000_000)} triệu` : ''}`, type: 'natural_language', constraints: { brand: product.brand, category: product.category, ...(ram ? { ram } : {}), ...(storage ? { storageGB: storage } : {}), ...(storageType ? { storageType } : {}), ...(vram ? { vramGB: vram } : {}), ...(display ? { displayInches: display } : {}), ...(budget ? { maxPrice: budget } : {}) } },
    ];
    for (const variant of variants) {
      cases.push({ ...variant, id: `${cases.length + 1}`.padStart(3, '0'), relevantProductIds: [id], generatedFrom: common });
    }
    if (cases.length >= 160) break;
  }
  if (cases.length < 160) throw new Error(`Only ${cases.length} positive labeled queries could be derived from eligible Mongo products; 160 are required before adding negative controls.`);
  const positives = cases.slice(0, 160);
  const negatives: EvaluationCase[] = [];
  for (let index = 1; index <= 20; index += 1) {
    negatives.push({
      id: `${160 + index}`,
      query: `laptop model QZ${900000 + index}NO`,
      type: 'no_result', relevantProductIds: [], constraints: { category: 'laptop' },
      expectedBasis: 'No eligible Product has this unique model identifier.',
    });
  }
  const impossibleRam = [4096, 8192, 16384, 32768, 65536];
  for (let index = 1; index <= 20; index += 1) {
    const ram = impossibleRam[(index - 1) % impossibleRam.length]! * (1 + Math.floor((index - 1) / impossibleRam.length));
    const eligibleCount = await Product.countDocuments({
      category: 'laptop', source: { $in: ['accesstrade', 'csv', 'curated'] }, verified: true,
      productVerificationStatus: 'verified', publicationStatus: 'published', 'normalizedSpecs.ramGB': { $gte: ram },
    });
    if (eligibleCount) throw new Error(`Negative RAM control unexpectedly has ${eligibleCount} eligible products at ${ram}GB.`);
    negatives.push({
      id: `${160 + 20 + index}`,
      query: `laptop RAM ${ram}GB`,
      type: 'no_result', relevantProductIds: [], constraints: { category: 'laptop', ram },
      expectedBasis: 'No eligible catalog product has the requested minimum RAM capacity.',
    });
  }
  return [...positives, ...negatives];
}

function percentile(sorted: number[], percent: number) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(percent * sorted.length) - 1)] : 0;
}

function checkConstraints(item: any, constraints: EvaluationCase['constraints']) {
  if (constraints.brand && String(item.brand ?? '').toLowerCase() !== constraints.brand.toLowerCase()) return false;
  if (constraints.category && item.category !== constraints.category) return false;
  if (constraints.ram) {
    const found = Number(item.normalizedSpecs?.ramGB ?? item.specs?.ram ?? 0);
    if (!Number.isFinite(found) || found < constraints.ram) return false;
  }
  if (constraints.storageGB) {
    const found = Number(item.normalizedSpecs?.storageGB ?? item.specs?.storage ?? 0);
    if (!Number.isFinite(found) || found < constraints.storageGB) return false;
  }
  if (constraints.storageType && item.normalizedSpecs?.storageType !== constraints.storageType) return false;
  if (constraints.vramGB) {
    const found = Number(item.normalizedSpecs?.vramGB ?? item.specs?.vram ?? 0);
    if (!Number.isFinite(found) || found < constraints.vramGB) return false;
  }
  if (constraints.displayInches) {
    const found = Number(item.normalizedSpecs?.displayInches ?? 0);
    const tolerance = Number.isInteger(constraints.displayInches) ? 0.75 : 0.25;
    if (!Number.isFinite(found) || Math.abs(found - constraints.displayInches) > tolerance) return false;
  }
  if (constraints.maxPrice) {
    const price = item.bestOffer?.price;
    if (typeof price !== 'number' || price > constraints.maxPrice) return false;
  }
  return true;
}

async function evaluate(cases: EvaluationCase[], label: string) {
  process.env.SEARCH_EVAL_SKIP_OLLAMA = 'true';
  process.env.SEARCH_EVAL_SKIP_DISCOVERY = 'true';
  const latencies: number[] = [];
  const perCase: any[] = [];
  let precision5 = 0;
  let recall10 = 0;
  let reciprocalRank = 0;
  let ndcg10 = 0;
  let exactTop1 = 0;
  let constraintViolations = 0;
  let constraintChecks = 0;

  for (const item of cases) {
    const start = performance.now();
    const result = await smartSearch(item.query, 10);
    const elapsedMs = performance.now() - start;
    latencies.push(elapsedMs);
    const ids = result.items.map((product: any) => String(product._id));
    const expected = new Set(item.relevantProductIds);
    const top5 = ids.slice(0, 5);
    const hits5 = top5.filter((id: string) => expected.has(id)).length;
    const hits10 = ids.slice(0, 10).filter((id: string) => expected.has(id)).length;
    if (expected.size) {
      precision5 += hits5 / 5;
      recall10 += hits10 / expected.size;
    }
    const rank = ids.findIndex((id: string) => expected.has(id)) + 1;
    if (expected.size) reciprocalRank += rank > 0 ? 1 / rank : 0;
    const dcg = rank > 0 && rank <= 10 ? 1 / Math.log2(rank + 1) : 0;
    if (expected.size) ndcg10 += dcg;
    if (item.type === 'exact_model' && ids[0] && expected.has(ids[0])) exactTop1 += 1;
    if (Object.keys(item.constraints).length) {
      constraintChecks += result.items.length;
      constraintViolations += result.items.filter((product: any) => !checkConstraints(product, item.constraints)).length;
    }
    perCase.push({ id: item.id, type: item.type, query: item.query, expectedProductIds: item.relevantProductIds, returnedProductIds: ids, latencyMs: Number(elapsedMs.toFixed(2)), hit: rank > 0, noResultCorrect: item.type === 'no_result' ? ids.length === 0 : undefined });
    if (perCase.length % 20 === 0) console.log(JSON.stringify({ evaluated: perCase.length, total: cases.length, label }));
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const positiveCases = cases.filter((item) => item.relevantProductIds.length > 0);
  const negativeCases = cases.filter((item) => item.type === 'no_result');
  const count = positiveCases.length;
  return {
    generatedAt: new Date().toISOString(), label, corpusSize: count,
    metrics: {
      precisionAt5: precision5 / count,
      recallAt10: recall10 / count,
      mrr: reciprocalRank / count,
      ndcgAt10: ndcg10 / count,
      exactModelTop1Accuracy: exactTop1 / cases.filter((item) => item.type === 'exact_model').length,
      noResultAccuracy: negativeCases.length ? perCase.filter((item) => item.type === 'no_result' && item.noResultCorrect).length / negativeCases.length : null,
      noResultQueryCount: negativeCases.length,
      constraintViolationRate: constraintChecks ? constraintViolations / constraintChecks : 0,
      latencyMs: { p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), mean: latencies.reduce((sum, value) => sum + value, 0) / latencies.length },
    },
    evaluationMethod: 'Positive cases are derived from eligible, verified MongoDB products and verified VND offers. One product ID per query is the labeled target because each query contains that product model. Negative cases use absent model identifiers or RAM constraints verified absent from the eligible catalog. Query parsing uses deterministic rules to keep retrieval/ranking comparisons repeatable; Ollama intent latency is excluded.',
    cases: perCase,
  };
}

async function evaluateLegacyNegativeCases() {
  const corpus = JSON.parse(await readFile(corpusFile, 'utf8')) as EvaluationCase[];
  const cases = corpus.filter((item) => item.type === 'no_result');
  const candidateCounts: Array<{ id: string; query: string; oldCandidateCount: number; correctNoResult: boolean }> = [];
  for (const item of cases) {
    const parsed = (await import('../services/queryParser')).parseQuery(item.query);
    const categoryWasExplicit = Boolean(parsed.category && (CATEGORIES[parsed.category]?.terms ?? []).some((term) => ` ${normalize(item.query)} `.includes(` ${normalize(term)} `)));
    const filter: any = {
      category: parsed.category && categoryWasExplicit ? { $in: [parsed.category] } : { $in: CANONICAL_CATEGORY_KEYS },
      electronicStatus: { $in: ['approved', null] }, source: { $in: ['accesstrade', 'csv', 'curated'] },
      verified: true, productVerificationStatus: 'verified', urlVerificationStatus: 'verified', publicationStatus: 'published',
      verifiedAt: { $ne: null }, productUrl: { $type: 'string', $ne: '' }, specificationSourceUrl: { $type: 'string', $ne: '' },
      brand: { $type: 'string', $ne: '' }, model: { $type: 'string', $ne: '' },
      $and: [{ $or: [
        { imageVerificationStatus: 'verified', imageUsagePermission: 'granted', imageUrl: { $type: 'string', $ne: '' }, imageSource: { $type: 'string', $ne: '' },
          $or: [{ imagePermissionEvidence: { $type: 'string', $ne: '' } }, { imageLicenseUrl: { $type: 'string', $ne: '' }, imageAttribution: { $type: 'string', $ne: '' } }] },
        { imageVerificationStatus: 'pending', imageUsagePermission: 'not_provided', imageUrl: null },
        ...(process.env.SERVE_LOCAL_ONLY_IMAGES === 'true' || process.env.NODE_ENV !== 'production' ? [{ imageVerificationStatus: 'pending', imageUsagePermission: 'not_provided', localOnlyAsset: true, imageUrl: { $regex: '^/catalog-images/[a-z0-9][a-z0-9._-]*\\.(jpg|jpeg|png|webp)$', $options: 'i' } }] : []),
      ] }],
    };
    if (parsed.brands.length) filter.brand = { $in: parsed.brands.map((brand) => new RegExp(`^${brand}$`, 'i')) };
    if (parsed.ram) filter['specs.ram'] = { $gte: parsed.ram };
    const candidates = await Product.find(filter).limit(300).select('_id').lean();
    candidateCounts.push({ id: item.id, query: item.query, oldCandidateCount: candidates.length, correctNoResult: candidates.length === 0 });
  }
  const report = {
    generatedAt: new Date().toISOString(), label: 'before_legacy_negative_controls', corpusSize: cases.length,
    noResultAccuracy: cases.length ? candidateCounts.filter((item) => item.correctNoResult).length / cases.length : null,
    evaluationMethod: 'Replayed the pre-upgrade Mongo candidate filters on negative controls. With an explicit category and no detected use-case tag, the legacy service returned all category candidates for an unmatched model; impossible RAM filters returned no candidates.',
    cases: candidateCounts,
  };
  const reportFile = resolve(reportsDir, 'search-evaluation-before-negative-controls.json');
  await writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ label: report.label, corpusSize: cases.length, noResultAccuracy: report.noResultAccuracy, reportFile }, null, 2));
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  mongoose.set('autoIndex', false);
  await mongoose.connect(process.env.MONGODB_URI);
  await mkdir(reportsDir, { recursive: true });
  if (process.argv.includes('--legacy-negative-baseline')) {
    await evaluateLegacyNegativeCases();
    await mongoose.disconnect();
    return;
  }
  const recheckArg = process.argv.find((arg) => arg.startsWith('--recheck-constraints='));
  if (recheckArg) {
    const label = recheckArg.slice('--recheck-constraints='.length);
    const corpus = JSON.parse(await readFile(corpusFile, 'utf8')) as EvaluationCase[];
    const reportFile = resolve(reportsDir, `search-evaluation-${label}.json`);
    const report = JSON.parse(await readFile(reportFile, 'utf8')) as any;
    const ids = [...new Set(report.cases.flatMap((item: any) => item.returnedProductIds))];
    const products = await Product.find({ _id: { $in: ids } }).select('_id brand category normalizedSpecs specs').lean() as any[];
    const offers = await Offer.find({ productId: { $in: ids }, verified: true, priceVerificationStatus: { $in: ['verified', null] }, price: { $gt: 0 }, productUrl: { $type: 'string', $ne: '' }, currency: 'VND' }).select('productId price').lean() as any[];
    const productById = new Map(products.map((product) => [String(product._id), product]));
    const priceById = new Map<string, number>();
    for (const offer of offers) {
      const id = String(offer.productId);
      if (!priceById.has(id) || offer.price < priceById.get(id)!) priceById.set(id, offer.price);
    }
    const constraintsByCase = new Map(corpus.map((item) => [item.id, item.constraints]));
    let checked = 0;
    let violations = 0;
    const violationSamples: any[] = [];
    for (const item of report.cases) {
      const constraints = constraintsByCase.get(item.id) ?? {};
      if (!Object.keys(constraints).length) continue;
      for (const id of item.returnedProductIds) {
        const product = productById.get(id);
        if (!product) continue;
        checked += 1;
        if (!checkConstraints({ ...product, bestOffer: priceById.has(id) ? { price: priceById.get(id) } : null }, constraints)) {
          violations += 1;
          if (violationSamples.length < 40) violationSamples.push({ caseId: item.id, query: item.query, type: item.type, productId: id, brand: product.brand, category: product.category, ramGB: product.normalizedSpecs?.ramGB ?? product.specs?.ram, price: priceById.get(id) ?? null, constraints });
        }
      }
    }
    report.metrics.constraintViolationRate = checked ? violations / checked : 0;
    report.metrics.constraintEvaluation = { checkedResults: checked, violations, note: 'Only constraints explicitly present in each generated query are evaluated.' };
    report.constraintViolationSamples = violationSamples;
    report.label = `${label}_constraints_corrected`;
    const correctedFile = resolve(reportsDir, `search-evaluation-${label}-constraints-corrected.json`);
    await writeFile(correctedFile, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({ label, constraintViolationRate: report.metrics.constraintViolationRate, checkedResults: checked, violations, reportFile: correctedFile }, null, 2));
    await mongoose.disconnect();
    return;
  }
  const generate = process.argv.includes('--generate');
  const labelArg = process.argv.find((arg) => arg.startsWith('--label='));
  const label = labelArg?.slice('--label='.length) || 'after';
  const cases = generate
    ? await generateCorpus()
    : JSON.parse(await readFile(corpusFile, 'utf8')) as EvaluationCase[];
  if (generate) await writeFile(corpusFile, JSON.stringify(cases, null, 2), 'utf8');
  if (generate && process.argv.includes('--corpus-only')) {
    console.log(JSON.stringify({ corpusSize: cases.length, positive: cases.filter((item) => item.relevantProductIds.length > 0).length, noResult: cases.filter((item) => item.type === 'no_result').length, corpusFile }, null, 2));
    await mongoose.disconnect();
    return;
  }
  const report = await evaluate(cases, label);
  const outputFile = resolve(reportsDir, `search-evaluation-${label}.json`);
  await writeFile(outputFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ corpusSize: cases.length, metrics: report.metrics, reportFile: outputFile, corpusFile }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Search evaluation failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
