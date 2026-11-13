import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { DataSource } from '../models/DataSource';
import { DataEnrichmentJob } from '../models/DataEnrichmentJob';
import { Offer } from '../models/Offer';
import { Product } from '../models/Product';
import { canonicalCategory } from '../services/taxonomy';

type FieldStatus = 'verified' | 'partial' | 'missing' | 'outdated' | 'invalid' | 'needs_review' | 'restricted';
type QualityStatuses = Record<string, FieldStatus>;
type SourceEvidence = { evidenceType?: string; sourceUrl?: string; sourceName?: string; verifiedAt?: Date | string };

const PRICE_FRESHNESS_DAYS = 14;
const BATCH_SIZE = 100;
const HTTPS = /^https:\/\//i;

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasObjectFields(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length);
}

function latestDate(values: Array<Date | string | null | undefined>): Date | null {
  const dates = values.map((value) => value ? new Date(value) : null).filter((value): value is Date => Boolean(value && Number.isFinite(value.getTime())));
  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;
}

function evidenceTypes(evidence: SourceEvidence[]) {
  return new Set(evidence.map(({ evidenceType }) => evidenceType).filter((value): value is string => Boolean(value)));
}

function fieldEvidence(field: string, evidence: SourceEvidence[]) {
  const accepted: Record<string, string[]> = {
    name: ['identity', 'product_identity', 'catalog_record'],
    brand: ['identity', 'product_identity', 'catalog_record'],
    model: ['identity', 'product_identity', 'catalog_record'],
    image: ['image', 'image_rights', 'image_license', 'image_local_copy'],
    specifications: ['specifications', 'variant_specifications', 'supplemental_source', 'specifications_reference'],
    price: ['offer', 'price', 'retailer_feed'],
    current_price: ['offer', 'price', 'retailer_feed'],
    product_url: ['product_page', 'product_variant_listing', 'retailer_feed'],
    description: ['description', 'description_synthesized_from_existing_specs'],
  };
  return evidence.filter((item) => (accepted[field] ?? []).includes(item.evidenceType ?? '') && HTTPS.test(item.sourceUrl ?? ''))
    .map((item) => item.sourceUrl as string);
}

function classifyProduct(product: any, offers: any[], now: Date) {
  const evidence: SourceEvidence[] = Array.isArray(product.sourceEvidence) ? product.sourceEvidence : [];
  const types = evidenceTypes(evidence);
  const verifiedIdentity = product.productVerificationStatus === 'verified' && evidence.length > 0;
  const nameStatus: FieldStatus = !nonEmpty(product.name) ? 'missing' : verifiedIdentity ? 'verified' : 'needs_review';
  const brandStatus: FieldStatus = !nonEmpty(product.brand) ? 'missing' : verifiedIdentity ? 'verified' : 'needs_review';
  const modelStatus: FieldStatus = !nonEmpty(product.model) ? 'missing' : verifiedIdentity ? 'verified' : 'needs_review';

  let imageStatus: FieldStatus;
  if (!nonEmpty(product.imageUrl)) imageStatus = 'missing';
  else if (!HTTPS.test(product.imageUrl) && product.localOnlyAsset !== true) imageStatus = 'invalid';
  else if (product.imageUsagePermission !== 'granted') imageStatus = 'restricted';
  else if (!nonEmpty(product.imageLicense) || !nonEmpty(product.imageLicenseUrl) || !nonEmpty(product.imageAttribution)) imageStatus = 'needs_review';
  else if (product.imageVerificationStatus === 'verified' && product.imageVisualIdentityChecked === true) imageStatus = 'verified';
  else imageStatus = 'needs_review';

  const hasSpecs = hasObjectFields(product.specifications);
  const specEvidence = fieldEvidence('specifications', evidence);
  const specsStatus: FieldStatus = !hasSpecs ? 'missing'
    : (specEvidence.length > 0 && HTTPS.test(product.specificationSourceUrl ?? '') && verifiedIdentity) ? 'verified' : 'partial';

  const productUrlStatus: FieldStatus = !nonEmpty(product.productUrl) ? 'missing'
    : !HTTPS.test(product.productUrl) ? 'invalid'
      : product.urlVerificationStatus === 'verified' && verifiedIdentity ? 'verified' : 'needs_review';

  const descriptionStatus: FieldStatus = !nonEmpty(product.description) ? 'missing'
    : types.has('description') || types.has('description_synthesized_from_existing_specs') ? 'verified' : 'partial';

  const priceRows = offers.filter((offer) => Number(offer.price) > 0 && nonEmpty(offer.currency) && HTTPS.test(offer.productUrl ?? ''));
  const verifiedOffers = priceRows.filter((offer) => offer.verified === true && offer.priceVerificationStatus === 'verified');
  const newestVerifiedOffer = latestDate(verifiedOffers.flatMap((offer) => [offer.sourceRetrievedAt, offer.verifiedAt, offer.lastUpdated]));
  const priceAgeDays = newestVerifiedOffer ? (now.getTime() - newestVerifiedOffer.getTime()) / 86_400_000 : null;
  const priceStatus: FieldStatus = newestVerifiedOffer && priceAgeDays !== null && priceAgeDays <= PRICE_FRESHNESS_DAYS ? 'verified'
    : newestVerifiedOffer ? 'outdated'
      : priceRows.length || (typeof product.price === 'number' && product.price > 0) ? 'needs_review' : 'missing';

  const requiredProvenance = ['identity', 'product_page', 'specifications'];
  const provenanceStatus: FieldStatus = !evidence.length ? 'missing'
    : requiredProvenance.every((type) => types.has(type)) ? 'verified' : 'partial';

  const statuses: QualityStatuses = {
    name: nameStatus,
    brand: brandStatus,
    model: modelStatus,
    image: imageStatus,
    specifications: specsStatus,
    price: priceStatus,
    product_url: productUrlStatus,
    description: descriptionStatus,
    source_provenance: provenanceStatus,
  };

  const evidenceByField = Object.fromEntries(Object.keys(statuses).map((field) => [field, fieldEvidence(field, evidence)]));
  if (verifiedOffers.length && newestVerifiedOffer) evidenceByField.price = verifiedOffers
    .filter((offer) => [offer.sourceRetrievedAt, offer.verifiedAt, offer.lastUpdated].some((date) => date && new Date(date).getTime() === newestVerifiedOffer.getTime()))
    .map((offer) => offer.productUrl as string);

  const missingFields = Object.entries(statuses).filter(([, status]) => status !== 'verified').map(([field]) => field);
  const actionableFields = missingFields.filter((field) => statuses[field] !== 'restricted');
  const manualReviewFields = missingFields.filter((field) => ['needs_review', 'invalid', 'restricted'].includes(statuses[field]));
  const status: 'pending' | 'needs_review' | 'completed' = missingFields.length === 0 ? 'completed'
    : manualReviewFields.length > 0 ? 'needs_review' : 'pending';

  return {
    productId: String(product._id),
    name: product.name,
    brand: product.brand ?? null,
    model: product.model ?? null,
    category: canonicalCategory(String(product.category ?? 'uncategorized')),
    source: product.source ?? 'unknown',
    publicationStatus: product.publicationStatus ?? 'unknown',
    productVerificationStatus: product.productVerificationStatus ?? 'pending',
    imageVerificationStatus: product.imageVerificationStatus ?? 'pending',
    urlVerificationStatus: product.urlVerificationStatus ?? 'pending',
    fieldStatuses: statuses,
    evidenceByField,
    missingFields,
    actionableFields,
    manualReviewFields,
    enrichmentJobStatus: status,
    freshVerifiedPriceObservedAt: newestVerifiedOffer,
    priceAgeDays: priceAgeDays === null ? null : Math.max(0, Math.floor(priceAgeDays)),
  };
}

function newAggregate(key: string) {
  return { key, products: 0, fields: {} as Record<string, { verified: number; partial: number; missing: number; outdated: number; invalid: number; needs_review: number; restricted: number }> };
}

function addToAggregate(aggregate: ReturnType<typeof newAggregate>, row: ReturnType<typeof classifyProduct>) {
  aggregate.products += 1;
  for (const [field, status] of Object.entries(row.fieldStatuses)) {
    aggregate.fields[field] ??= { verified: 0, partial: 0, missing: 0, outdated: 0, invalid: 0, needs_review: 0, restricted: 0 };
    aggregate.fields[field][status] += 1;
  }
}

function withCoveragePercentages(aggregate: ReturnType<typeof newAggregate>) {
  return {
    ...aggregate,
    fields: Object.fromEntries(Object.entries(aggregate.fields).map(([field, counts]) => [field, {
      ...counts,
      coveragePercent: aggregate.products ? Number(((counts.verified / aggregate.products) * 100).toFixed(2)) : 0,
    }])),
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  try {
    const now = new Date();
    const sourcePermissions = await DataSource.find({}).select('sourceKey name adapter domain sellerName termsUrl dataUsageAuthorized dataPermissionEvidence imageUsageAuthorized imagePermissionEvidence legalReviewedAt active lastRunAt lastRunStats lastRunError').lean() as any[];
    const offerGroups = await Offer.aggregate([
      { $group: { _id: '$productId', rows: { $push: {
        price: '$price', currency: '$currency', productUrl: '$productUrl', verified: '$verified',
        priceVerificationStatus: '$priceVerificationStatus', sourceRetrievedAt: '$sourceRetrievedAt',
        verifiedAt: '$verifiedAt', lastUpdated: '$lastUpdated',
      } } } },
    ]);
    const offersByProduct = new Map<string, any[]>(offerGroups.map((group: any) => [String(group._id), group.rows]));
    const records: ReturnType<typeof classifyProduct>[] = [];
    const byCategory = new Map<string, ReturnType<typeof newAggregate>>();
    const byBrand = new Map<string, ReturnType<typeof newAggregate>>();
    const sourceCounts = new Map<string, number>();
    let batch: any[] = [];
    let writtenProducts = 0;
    let writtenJobs = 0;
    const saveBatch = async () => {
      if (!batch.length || !apply) { batch = []; return; }
      const productOps = batch.map(({ product, quality }) => ({
        updateOne: {
          filter: { _id: product._id },
          update: { $set: { catalogQuality: quality.fieldStatuses, catalogQualityCheckedAt: now } },
        },
      }));
      const existingJobs = await DataEnrichmentJob.find({ productId: { $in: batch.map(({ product }) => product._id) } })
        .select('productId status attempts lastError lastAttemptAt nextAttemptAt checkpoint').lean() as any[];
      const existingJobByProduct = new Map(existingJobs.map((job) => [String(job.productId), job]));
      const jobOps = batch.map(({ product, quality }) => ({
        updateOne: {
          filter: { productId: product._id },
          update: {
            $set: {
              fieldStatuses: quality.fieldStatuses,
              missingFields: quality.missingFields,
              status: existingJobByProduct.get(String(product._id))?.status === 'running' ? 'running' : quality.enrichmentJobStatus,
              nextAttemptAt: existingJobByProduct.get(String(product._id))?.status === 'running'
                ? existingJobByProduct.get(String(product._id))?.nextAttemptAt ?? null
                : quality.enrichmentJobStatus === 'pending' ? now : null,
              checkpoint: {
                ...(existingJobByProduct.get(String(product._id))?.checkpoint ?? {}),
                lastQualityAudit: { checkedAt: now, evidenceByField: quality.evidenceByField },
              },
            },
            $setOnInsert: {
              productId: product._id,
              attempts: existingJobByProduct.get(String(product._id))?.attempts ?? 0,
              lastError: existingJobByProduct.get(String(product._id))?.lastError ?? null,
              lastAttemptAt: existingJobByProduct.get(String(product._id))?.lastAttemptAt ?? null,
            },
          },
          upsert: true,
        },
      }));
      const [productsResult, jobsResult] = await Promise.all([
        Product.bulkWrite(productOps as any, { ordered: false }),
        DataEnrichmentJob.bulkWrite(jobOps as any, { ordered: false }),
      ]);
      writtenProducts += productsResult.modifiedCount;
      writtenJobs += jobsResult.upsertedCount + jobsResult.modifiedCount;
      batch = [];
    };

    const cursor = Product.find({}).select('_id name brand model category source specifications description imageUrl localOnlyAsset imageUsagePermission imageLicense imageLicenseUrl imageAttribution imageVisualIdentityChecked imageVerificationStatus productVerificationStatus urlVerificationStatus publicationStatus productUrl specificationSourceUrl sourceEvidence price').lean().cursor({ batchSize: BATCH_SIZE });
    for await (const product of cursor) {
      const quality = classifyProduct(product, offersByProduct.get(String(product._id)) ?? [], now);
      records.push(quality);
      byCategory.set(quality.category, byCategory.get(quality.category) ?? newAggregate(quality.category));
      addToAggregate(byCategory.get(quality.category)!, quality);
      const brandKey = nonEmpty(quality.brand) ? quality.brand.trim() : '(brand missing)';
      byBrand.set(brandKey, byBrand.get(brandKey) ?? newAggregate(brandKey));
      addToAggregate(byBrand.get(brandKey)!, quality);
      sourceCounts.set(quality.source, (sourceCounts.get(quality.source) ?? 0) + 1);
      batch.push({ product, quality });
      if (batch.length >= BATCH_SIZE) await saveBatch();
    }
    await saveBatch();

    const fieldNames = ['name', 'brand', 'model', 'image', 'specifications', 'price', 'product_url', 'description', 'source_provenance'];
    const global = newAggregate('all');
    for (const row of records) addToAggregate(global, row);
    const missingFieldCounts = Object.fromEntries(fieldNames.map((field) => [field, {
      verified: global.fields[field]?.verified ?? 0,
      partial: global.fields[field]?.partial ?? 0,
      missing: global.fields[field]?.missing ?? 0,
      outdated: global.fields[field]?.outdated ?? 0,
      invalid: global.fields[field]?.invalid ?? 0,
      needs_review: global.fields[field]?.needs_review ?? 0,
      restricted: global.fields[field]?.restricted ?? 0,
      coveragePercent: global.products ? Number((((global.fields[field]?.verified ?? 0) / global.products) * 100).toFixed(2)) : 0,
    }]));
    const jobs = records.filter((row) => row.missingFields.length > 0);
    const report = {
      generatedAt: now.toISOString(),
      mode: apply ? 'apply' : 'dry-run',
      database: mongoose.connection.name,
      rules: {
        priceFreshnessDays: PRICE_FRESHNESS_DAYS,
        verifiedImageNeeds: ['image URL', 'granted usage permission', 'license and attribution metadata', 'verified image status', 'visual identity check'],
        verifiedSpecificationsNeed: ['non-empty specifications object', 'HTTPS specification source', 'specification evidence', 'verified product identity'],
        sourceProvenanceNeeds: ['identity', 'product_page', 'specifications evidence types'],
        sourcePermissionNote: 'A reachable image or product URL does not grant reuse rights. Restricted images stay out of approved display and are only queued for rights review.',
      },
      summary: {
        products: records.length,
        uniqueBrandModelPairs: new Set(records.filter((row) => row.brand && row.model).map((row) => `${row.brand!.toLowerCase()}|${row.model!.toLowerCase()}`)).size,
        brands: new Set(records.map((row) => row.brand?.trim().toLowerCase()).filter(Boolean)).size,
        categories: new Set(records.map((row) => row.category)).size,
        productsNeedingEnrichment: jobs.length,
        jobsNeedingManualReview: jobs.filter((row) => row.enrichmentJobStatus === 'needs_review').length,
        jobsPending: jobs.filter((row) => row.enrichmentJobStatus === 'pending').length,
        jobsCompleted: records.length - jobs.length,
        databaseProductsUpdated: writtenProducts,
        enrichmentJobsUpsertedOrUpdated: writtenJobs,
        sourceCounts: Object.fromEntries(sourceCounts),
        sourcePermissions: sourcePermissions.map((source) => ({
          sourceKey: source.sourceKey,
          name: source.name,
          adapter: source.adapter,
          domain: source.domain,
          sellerName: source.sellerName,
          dataUsageAuthorized: source.dataUsageAuthorized === true,
          imageUsageAuthorized: source.imageUsageAuthorized === true,
          termsUrl: source.termsUrl,
          dataPermissionEvidence: source.dataPermissionEvidence,
          imagePermissionEvidence: source.imagePermissionEvidence,
          legalReviewedAt: source.legalReviewedAt,
          active: source.active === true,
          lastRunAt: source.lastRunAt,
          lastRunStats: source.lastRunStats,
          lastRunError: source.lastRunError,
          dataPermissionStatus: source.dataUsageAuthorized === true ? 'authorized' : 'not_authorized',
          imagePermissionStatus: source.imageUsageAuthorized === true ? 'authorized' : 'not_authorized',
        })),
        fieldCoverage: missingFieldCounts,
      },
      byCategory: [...byCategory.values()].map(withCoveragePercentages).sort((a, b) => a.key.localeCompare(b.key)),
      byBrand: [...byBrand.values()].map(withCoveragePercentages).sort((a, b) => a.key.localeCompare(b.key)),
      issues: jobs,
    };

    const projectRoot = resolve(process.cwd(), '..');
    await mkdir(projectRoot, { recursive: true });
    await writeFile(resolve(projectRoot, 'PRODUCT_FIELD_QUALITY.json'), JSON.stringify(report, null, 2), 'utf8');
    const markdown = [
      '# Product field quality report',
      '',
      `Generated ${report.generatedAt} from MongoDB \`${report.database}\` in ${report.mode} mode.`,
      '',
      '## Summary',
      '',
      `- Products checked: ${records.length}`,
      `- Unique brand/model pairs: ${report.summary.uniqueBrandModelPairs}`,
      `- Brands / categories: ${report.summary.brands} / ${report.summary.categories}`,
      `- Products with at least one field to review or enrich: ${jobs.length}`,
      `- Jobs needing manual review: ${report.summary.jobsNeedingManualReview}`,
      `- Price freshness window: ${PRICE_FRESHNESS_DAYS} days`,
      '',
      '## Field status',
      '',
      '| Field | Verified | Partial | Missing | Outdated | Invalid | Needs review | Restricted | Verified coverage |',
      '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
      ...fieldNames.map((field) => {
        const row = missingFieldCounts[field];
        return `| ${field} | ${row.verified} | ${row.partial} | ${row.missing} | ${row.outdated} | ${row.invalid} | ${row.needs_review} | ${row.restricted} | ${row.coveragePercent}% |`;
      }),
      '',
      '## Coverage by category',
      '',
      '| Category | Products | Specs verified | Images verified | Prices current | URLs verified |',
      '|---|---:|---:|---:|---:|---:|',
      ...report.byCategory.map((row) => `| ${row.key} | ${row.products} | ${row.fields.specifications.verified} (${row.fields.specifications.coveragePercent}%) | ${row.fields.image.verified} (${row.fields.image.coveragePercent}%) | ${row.fields.price.verified} (${row.fields.price.coveragePercent}%) | ${row.fields.product_url.verified} (${row.fields.product_url.coveragePercent}%) |`),
      '',
      '## Rows needing work',
      '',
      'The full product-level queue, field statuses, and evidence URLs are in `PRODUCT_FIELD_QUALITY.json`. The table below lists all records missing a model, with no official product URL, or with fields needing rights/manual review.',
      '',
      '| Product | Category | Brand / model | Work fields |',
      '|---|---|---|---|',
      ...jobs.filter((row) => !row.model || row.fieldStatuses.image === 'restricted' || row.fieldStatuses.product_url !== 'verified' || row.manualReviewFields.length)
        .slice(0, 100)
        .map((row) => `| ${row.name.replace(/\|/g, '\\|')} | ${row.category} | ${(row.brand ?? '(missing)')} / ${(row.model ?? '(missing)')} | ${row.missingFields.join(', ')} |`),
      '',
      '## Interpretation',
      '',
      '- `verified` means the required stored evidence and field-specific verification conditions are present.',
      '- `partial` means a value exists but its evidence is incomplete.',
      '- `outdated` applies to the latest verified offer older than the configured 14-day freshness window.',
      '- `restricted` means an image is present but its reuse permission is not granted.',
      '- URL reachability does not confirm exact model identity, and an image URL does not grant image rights.',
      '- Dry-run writes the two reports only. Run `npm run audit:field-quality -- --apply` after backing up MongoDB to store `catalogQuality` on each product and create/resume one `dataenrichmentjobs` row per product.',
      '',
    ].join('\n');
    await writeFile(resolve(projectRoot, 'PRODUCT_FIELD_REVIEW.md'), markdown, 'utf8');
    console.log(JSON.stringify({ ...report.summary, reportFile: resolve(projectRoot, 'PRODUCT_FIELD_QUALITY.json'), reviewFile: resolve(projectRoot, 'PRODUCT_FIELD_REVIEW.md') }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Catalog field quality audit failed.');
  await mongoose.disconnect();
  process.exitCode = 1;
});
