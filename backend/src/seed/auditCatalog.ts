import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { CANONICAL_CATEGORIES, canonicalCategory } from '../services/taxonomy';
import { Product } from '../models/Product';
import { PendingProduct } from '../models/PendingProduct';
import { Offer } from '../models/Offer';
import { SyncRun } from '../models/SyncRun';
import { webSearchProvider } from '../services/webSearchProvider';

async function main() {
  await connectDB();
  const rows = await Product.aggregate([
    {
      $group: {
        _id: '$category',
        total: { $sum: 1 },
        verified: { $sum: { $cond: [{ $eq: ['$verified', true] }, 1, 0] } },
        eligibleVerified: {
          $sum: {
            $cond: [
              { $and: [
                { $eq: ['$verified', true] },
                { $eq: ['$electronicStatus', 'approved'] },
                { $eq: ['$imageUsagePermission', 'granted'] },
                { $ne: ['$imageUrl', null] },
                { $ne: ['$imageSource', null] },
                { $or: [
                  { $and: [{ $ne: ['$imagePermissionEvidence', null] }, { $ne: ['$imagePermissionEvidence', ''] }] },
                  { $and: [{ $ne: ['$imageLicenseUrl', null] }, { $ne: ['$imageAttribution', null] }] },
                ] },
                { $ne: ['$productUrl', null] },
                { $ne: ['$specificationSourceUrl', null] },
                { $ne: ['$verifiedAt', null] },
                { $ne: ['$model', null] },
                { $ne: ['$brand', null] },
                { $gt: [{ $size: { $objectToArray: { $ifNull: ['$specifications', {}] } } }, 0] },
              ] },
              1,
              0,
            ],
          },
        },
        sample: { $sum: { $cond: [{ $eq: ['$source', 'sample'] }, 1, 0] } },
        unverified: { $sum: { $cond: [{ $ne: ['$verified', true] }, 1, 0] } },
        pendingReview: { $sum: { $cond: [{ $eq: ['$electronicStatus', 'pending_review'] }, 1, 0] } },
        withImageUrl: { $sum: { $cond: [{ $ne: ['$imageUrl', null] }, 1, 0] } },
        withProductUrl: { $sum: { $cond: [{ $ne: ['$productUrl', null] }, 1, 0] } },
        withPrice: { $sum: { $cond: [{ $gt: ['$price', 0] }, 1, 0] } },
      },
    },
  ]);

  const mapped = new Map<string, any>();
  for (const row of rows) {
    const key = canonicalCategory(row._id ?? 'uncategorized');
    const prior = mapped.get(key) ?? { category: key, total: 0, verified: 0, eligibleVerified: 0, sample: 0, unverified: 0, pendingReview: 0, withImageUrl: 0, withProductUrl: 0, withPrice: 0 };
    for (const field of ['total', 'verified', 'eligibleVerified', 'sample', 'unverified', 'pendingReview', 'withImageUrl', 'withProductUrl', 'withPrice']) prior[field] += row[field] ?? 0;
    mapped.set(key, prior);
  }

  const pendingFilter = { classification: 'pending_review', reviewDecision: null };
  const pendingRows = await PendingProduct.find(pendingFilter).select('sourceKey raw reasons productVerificationStatus imageVerificationStatus urlVerificationStatus publicationStatus').lean() as any[];
  const pending = pendingRows.length;
  const categories = CANONICAL_CATEGORIES.map(({ key, label }) => {
    const row = mapped.get(key) ?? { category: key, total: 0, verified: 0, eligibleVerified: 0, sample: 0, unverified: 0, pendingReview: 0, withImageUrl: 0, withProductUrl: 0, withPrice: 0 };
    const pendingResearchQueue = pendingRows.filter((pendingRow) => canonicalCategory(pendingRow.raw?.category ?? pendingRow.raw?.cate ?? 'uncategorized') === key).length;
    return { ...row, pendingResearchQueue, pending: row.pendingReview + pendingResearchQueue, label };
  });
  const duplicates = await Product.aggregate([
    { $match: { $and: [{ brand: { $type: 'string', $ne: '' } }, { model: { $type: 'string', $ne: '' } }] } },
    { $group: { _id: { brand: { $toLower: '$brand' }, model: { $toLower: '$model' } }, count: { $sum: 1 }, categories: { $addToSet: '$category' }, sources: { $addToSet: '$source' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]);
  const bySource = await Product.aggregate([{ $group: { _id: '$source', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  const rejected = await PendingProduct.countDocuments({ classification: 'rejected' });
  const suspectedDuplicateRows = await Product.countDocuments({ 'duplicateReview.status': 'suspected_duplicate' });
  const verifiedOfferFilter = { verified: true, verifiedAt: { $ne: null }, price: { $gt: 0 }, currency: 'VND', productUrl: { $type: 'string', $ne: '' } };
  const [verifiedOffers, verifiedPriceProducts] = await Promise.all([
    Offer.countDocuments(verifiedOfferFilter),
    Offer.distinct('productId', verifiedOfferFilter),
  ]);

  const products = await Product.find({}).select('name brand model modelNumber category family generation releaseYear productStatus verified verifiedAt electronicStatus imageUrl imageSource imageUsagePermission imagePermissionEvidence imageLicense imageLicenseUrl imageAttribution productUrl specificationSourceUrl specifications variants sourceEvidence source productVerificationStatus imageVerificationStatus urlVerificationStatus publicationStatus').lean() as any[];
  const productTotal = products.length;
  const isCatalogEligible = (product: any) => Boolean(
    product.verified === true && product.verifiedAt && product.electronicStatus !== 'pending_review'
    && product.imageUsagePermission === 'granted' && product.imageUrl && product.imageSource
    && (product.imagePermissionEvidence || (product.imageLicenseUrl && product.imageAttribution))
    && product.productUrl && product.specificationSourceUrl && product.model && product.brand
    && product.specifications && typeof product.specifications === 'object' && Object.keys(product.specifications).length,
  );
  const hasImageRights = (product: any) => Boolean(product.imageUsagePermission === 'granted' && product.imageUrl && product.imageSource && product.imageLicense && product.imageLicenseUrl && product.imageAttribution);
  const hasSpecs = (product: any) => Boolean(product.specifications && typeof product.specifications === 'object' && Object.keys(product.specifications).length);
  const hasHttps = (value: unknown) => typeof value === 'string' && /^https:\/\//i.test(value);
  const modelKey = (product: any) => `${String(product.brand ?? '').trim().toLowerCase()}|${String(product.model ?? '').trim().toLowerCase()}`;
  const uniqueModels = new Set(products.filter((product) => product.brand && product.model).map(modelKey));
  const variantsTotal = products.reduce((sum, product) => sum + (Array.isArray(product.variants) ? product.variants.length : 0), 0);
  const productStatusCounts = new Map<string, number>();
  for (const product of products) {
    const status = product.productStatus && ['active', 'discontinued', 'end_of_life'].includes(product.productStatus) ? product.productStatus : 'unknown';
    productStatusCounts.set(status, (productStatusCounts.get(status) ?? 0) + 1);
  }
  const verificationByCategory = new Map<string, any>();
  const addVerificationRecord = (categoryValue: unknown, statuses: Record<string, unknown>) => {
    const category = canonicalCategory(typeof categoryValue === 'string' ? categoryValue : 'uncategorized');
    const row = verificationByCategory.get(category) ?? {
      category, records: 0,
      productVerified: 0, productPending: 0, productRejected: 0,
      imageVerified: 0, imagePending: 0, imageRejected: 0,
      urlVerified: 0, urlPending: 0, urlRejected: 0,
      published: 0, publicationPending: 0, hidden: 0,
    };
    row.records += 1;
    for (const prefix of ['product', 'image', 'url']) {
      const value = statuses[`${prefix}VerificationStatus`];
      const state = ['verified', 'pending', 'rejected'].includes(String(value)) ? String(value) : 'pending';
      row[`${prefix}${state[0].toUpperCase()}${state.slice(1)}`] += 1;
    }
    const publication = statuses.publicationStatus;
    row[publication === 'published' ? 'published' : publication === 'hidden' ? 'hidden' : 'publicationPending'] += 1;
    verificationByCategory.set(category, row);
  };
  for (const product of products) addVerificationRecord(product.category, product);
  for (const pendingRow of pendingRows) {
    const raw = pendingRow.raw ?? {};
    addVerificationRecord(raw.category ?? raw.cate, {
      productVerificationStatus: pendingRow.productVerificationStatus ?? raw.productVerificationStatus,
      imageVerificationStatus: pendingRow.imageVerificationStatus ?? raw.imageVerificationStatus,
      urlVerificationStatus: pendingRow.urlVerificationStatus ?? raw.urlVerificationStatus,
      publicationStatus: pendingRow.publicationStatus ?? raw.publicationStatus,
    });
  }
  const verificationTotals = [...verificationByCategory.values()].reduce((total, row) => {
    for (const field of ['records', 'productVerified', 'productPending', 'productRejected', 'imageVerified', 'imagePending', 'imageRejected', 'urlVerified', 'urlPending', 'urlRejected', 'published', 'publicationPending', 'hidden']) total[field] += row[field];
    return total;
  }, { records: 0, productVerified: 0, productPending: 0, productRejected: 0, imageVerified: 0, imagePending: 0, imageRejected: 0, urlVerified: 0, urlPending: 0, urlRejected: 0, published: 0, publicationPending: 0, hidden: 0 });
  const byFamily = new Map<string, any>();
  for (const product of products) {
    const key = [canonicalCategory(product.category ?? 'uncategorized'), product.brand || '(brand not recorded)', product.family || '(family not recorded)'].join('|');
    const row = byFamily.get(key) ?? {
      category: canonicalCategory(product.category ?? 'uncategorized'), brand: product.brand || '(brand not recorded)',
      family: product.family || '(family not recorded)', modelKeys: new Set<string>(), totalModels: 0, verified: 0,
      pending: 0, missingImages: 0, missingUrls: 0,
    };
    if (product.model) row.modelKeys.add(modelKey(product));
    if (isCatalogEligible(product)) row.verified += 1;
    if (!isCatalogEligible(product)) row.pending += 1;
    if (!hasImageRights(product)) row.missingImages += 1;
    if (!hasHttps(product.productUrl) || !hasHttps(product.specificationSourceUrl)) row.missingUrls += 1;
    byFamily.set(key, row);
  }
  for (const pendingRow of pendingRows) {
    const raw = pendingRow.raw ?? {};
    const brand = typeof raw.brand === 'string' && raw.brand.trim() ? raw.brand.trim() : '(brand not recorded)';
    const family = typeof raw.family === 'string' && raw.family.trim() ? raw.family.trim() : '(family not recorded)';
    const category = canonicalCategory(raw.category ?? raw.cate ?? 'uncategorized');
    const key = [category, brand, family].join('|');
    const row = byFamily.get(key) ?? {
      category, brand, family, modelKeys: new Set<string>(), totalModels: 0, verified: 0,
      pending: 0, missingImages: 0, missingUrls: 0,
    };
    const model = typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : String(pendingRow.sourceKey);
    const pendingModelKey = `${brand.toLowerCase()}|${model.toLowerCase()}`;
    if (!row.modelKeys.has(pendingModelKey)) {
      row.modelKeys.add(pendingModelKey);
      row.pending += 1;
      if (!raw.imageUrl || raw.imageUsagePermission !== 'granted') row.missingImages += 1;
      if (!hasHttps(raw.productUrl) || !hasHttps(raw.specificationSourceUrl)) row.missingUrls += 1;
    }
    byFamily.set(key, row);
  }
  const familyRows = [...byFamily.values()].map(({ modelKeys, ...row }) => ({ ...row, totalModels: modelKeys.size }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.brand.localeCompare(b.brand) || a.family.localeCompare(b.family));
  const [distinctBrands, distinctFamilies, distinctGenerations, pendingProductDocs, rejectedProductDocs, totalOffers, recentRuns] = await Promise.all([
    Product.distinct('brand', { brand: { $type: 'string', $ne: '' } }),
    Product.distinct('family', { family: { $type: 'string', $ne: '' } }),
    Product.distinct('generation', { generation: { $type: 'string', $ne: '' } }),
    Product.countDocuments({ electronicStatus: 'pending_review' }),
    PendingProduct.countDocuments({ classification: 'rejected' }),
    Offer.countDocuments(),
    SyncRun.find({}).sort({ startedAt: -1 }).limit(100).lean(),
  ]);
  const outputRoot = resolve(process.cwd(), '..');
  let urlVerification: Record<string, any> | null = null;
  try { urlVerification = JSON.parse(await readFile(resolve(outputRoot, 'CATALOG_URL_VERIFICATION.json'), 'utf8')); } catch { /* no successful verifier report exists yet */ }
  const eligibleTotal = categories.reduce((sum, row) => sum + row.eligibleVerified, 0);
  const coverage = {
    generatedAt: new Date().toISOString(),
    urlVerification,
    database: mongoose.connection.name,
    productTotal,
    uniqueModelCount: uniqueModels.size,
    brandCount: distinctBrands.length,
    productFamilyCount: distinctFamilies.length,
    generationCount: distinctGenerations.length,
    variantCount: variantsTotal,
    pendingResearchModelCount: new Set(pendingRows.map((row) => `${String(row.raw?.brand ?? '').trim().toLowerCase()}|${String(row.raw?.model ?? '').trim().toLowerCase()}`)).size,
    pendingResearchFamilyCount: new Set(pendingRows.map((row) => `${canonicalCategory(row.raw?.category ?? row.raw?.cate ?? 'uncategorized')}|${String(row.raw?.brand ?? '').trim().toLowerCase()}|${String(row.raw?.family ?? '').trim().toLowerCase()}`).filter((key) => !key.endsWith('|'))).size,
    pendingResearchGenerationCount: new Set(pendingRows.map((row) => `${canonicalCategory(row.raw?.category ?? row.raw?.cate ?? 'uncategorized')}|${String(row.raw?.brand ?? '').trim().toLowerCase()}|${String(row.raw?.family ?? '').trim().toLowerCase()}|${String(row.raw?.generation ?? '').trim().toLowerCase()}`).filter((key) => !key.endsWith('|'))).size,
    pendingResearchVariantCount: pendingRows.reduce((sum, row) => sum + (Array.isArray(row.raw?.variants) ? row.raw.variants.length : 0), 0),
    productStatusCounts: Object.fromEntries(productStatusCounts),
    verificationTotals,
    verificationByCategory: CANONICAL_CATEGORIES.map(({ key }) => verificationByCategory.get(key) ?? {
      category: key, records: 0, productVerified: 0, productPending: 0, productRejected: 0,
      imageVerified: 0, imagePending: 0, imageRejected: 0, urlVerified: 0, urlPending: 0,
      urlRejected: 0, published: 0, publicationPending: 0, hidden: 0,
    }),
    unverifiedProductRecords: products.filter((product) => product.verified !== true).length,
    legacyProductRecords: products.filter((product) => product.source == null || product.source === 'sample').length,
    canonicalCategoryCount: categories.length,
    eligibleVerifiedTotal: eligibleTotal,
    pending: pending + pendingProductDocs,
    pendingResearchQueueRecords: pendingRows.length,
    pendingResearchWithSourceEvidence: pendingRows.filter((row) => Array.isArray(row.raw?.sourceEvidence) && row.raw.sourceEvidence.length > 0).length,
    pendingResearchWithProductAndSpecsHttpsUrls: pendingRows.filter((row) => hasHttps(row.raw?.productUrl) && hasHttps(row.raw?.specificationSourceUrl)).length,
    pendingResearchWithImageLicenseCandidate: pendingRows.filter((row) => typeof row.raw?.imageCandidate?.license === 'string' && row.raw.imageCandidate.license).length,
    pendingResearchWithoutDisplayableImage: pendingRows.filter((row) => !row.raw?.imageUrl).length,
    rejected: rejectedProductDocs,
    productsWithLicensedImageMetadata: products.filter(hasImageRights).length,
    productsWithProductAndSpecsHttpsUrls: products.filter((product) => hasHttps(product.productUrl) && hasHttps(product.specificationSourceUrl)).length,
    productsWithSpecifications: products.filter(hasSpecs).length,
    productsWithSourceEvidence: products.filter((product) => Array.isArray(product.sourceEvidence) && product.sourceEvidence.length > 0).length,
    productsMissingImageRights: products.filter((product) => !hasImageRights(product)).length,
    productsMissingProductOrSpecsUrl: products.filter((product) => !hasHttps(product.productUrl) || !hasHttps(product.specificationSourceUrl)).length,
    productsMissingModel: products.filter((product) => !product.model || !product.brand).length,
    verifiedPrices: verifiedOffers,
    productsWithVerifiedPrice: verifiedPriceProducts.length,
    totalOffers,
    liveSearchProvider: { status: webSearchProvider.configured ? 'configured' : 'not_configured', provider: webSearchProvider.provider },
    bySource,
    duplicateBrandModelGroups: duplicates.length,
    duplicateBrandModelSamples: duplicates.slice(0, 20),
    suspectedDuplicateRows,
    categories,
    familyCoverage: familyRows,
  };
  const markdownRows = familyRows.map((row) => `| ${row.category} | ${row.brand} | ${row.family} | ${row.totalModels} | ${row.verified} | ${row.pending} | ${row.missingImages} | ${row.missingUrls} |`).join('\n');
  const report = `# Product Catalog Report\n\nGenerated from MongoDB database \`${coverage.database}\` at ${coverage.generatedAt}.\n\n## Summary\n\n- Canonical categories: ${coverage.canonicalCategoryCount}\n- Products: ${productTotal}\n- Unique brand/model pairs: ${uniqueModels.size}\n- Brands: ${distinctBrands.length}\n- Product families recorded: ${distinctFamilies.length}\n- Generations recorded: ${distinctGenerations.length}\n- Variants: ${variantsTotal}\n- Catalog-eligible verified products (structural checks): ${eligibleTotal}\n- Pending products: ${coverage.pending}\n- Rejected products: ${coverage.rejected}\n- Products with documented image license metadata: ${coverage.productsWithLicensedImageMetadata}\n- Products with HTTPS product and specification URLs: ${coverage.productsWithProductAndSpecsHttpsUrls}\n- Products with technical specifications: ${coverage.productsWithSpecifications}\n- Products with per-field source evidence: ${coverage.productsWithSourceEvidence}\n- Verified Offers: ${verifiedOffers} (${verifiedPriceProducts.length} products)\n- Products missing image-rights metadata: ${coverage.productsMissingImageRights}\n- Products missing product or specification URLs: ${coverage.productsMissingProductOrSpecsUrl}\n- Products missing brand/model: ${coverage.productsMissingModel}\n- Duplicate brand/model groups: ${duplicates.length}\n\nCounts reflect records currently stored in MongoDB. Structural eligibility does not establish exhaustive manufacturer coverage or independently confirm every specification/image against the source page. A model roster per family is needed to calculate undiscovered models.\n\n## Coverage by category, brand, and family\n\n| Category | Brand | Product Family | Total Models | Verified | Pending | Missing Images | Missing URLs |\n|---|---|---|---:|---:|---:|---:|---:|\n${markdownRows}\n`;
  const statusSummary = `- Independent statuses across Product and active PendingProduct rows: product verified ${verificationTotals.productVerified}, pending ${verificationTotals.productPending}; image verified ${verificationTotals.imageVerified}, pending ${verificationTotals.imagePending}; URL verified ${verificationTotals.urlVerified}, pending ${verificationTotals.urlPending}; published ${verificationTotals.published}, publication pending ${verificationTotals.publicationPending}, hidden ${verificationTotals.hidden}.`;
  const reportWithDuplicateSummary = report.replace(`- Duplicate brand/model groups: ${duplicates.length}`, `- Duplicate brand/model groups: ${duplicates.length}\n- Hidden rows marked as suspected duplicates: ${coverage.suspectedDuplicateRows}`);
  const reportWithStatusSummary = reportWithDuplicateSummary.replace(`- Verified Offers: ${verifiedOffers} (${verifiedPriceProducts.length} products)`, `${statusSummary}\n- Verified Offers: ${verifiedOffers} (${verifiedPriceProducts.length} products)`);
  const urlVerificationNote = urlVerification
    ? `## URL verification\n\nThe latest read-only verifier checked ${urlVerification.catalogEntries} curated seed entries at ${urlVerification.checkedAt}: ${urlVerification.imageUrlsReachable} image URLs, ${urlVerification.productPageUrlsReachable} product URLs, and ${urlVerification.specificationUrlsReachable} specification URLs responded successfully. Check scope: ${urlVerification.checkScope}\n\n`
    : '## URL verification\n\nNo saved live URL verification report is available.\n\n';
  const pendingResearchNote = `## Pending research queue\n\n- Models: ${coverage.pendingResearchModelCount}; families: ${coverage.pendingResearchFamilyCount}; generations: ${coverage.pendingResearchGenerationCount}; recorded variants: ${coverage.pendingResearchVariantCount}.\n- Records with per-field evidence: ${coverage.pendingResearchWithSourceEvidence}; records with product and specifications HTTPS URLs: ${coverage.pendingResearchWithProductAndSpecsHttpsUrls}.\n- Licensed image candidates: ${coverage.pendingResearchWithImageLicenseCandidate}; records without a displayable, visually checked image: ${coverage.pendingResearchWithoutDisplayableImage}.\n- These records remain private in PendingProduct and are not included in Product or Offer totals.\n\n`;
  const liveSearchProviderNote = `## Runtime web search\n\n- Provider: ${coverage.liveSearchProvider.status}${coverage.liveSearchProvider.provider ? ` (${coverage.liveSearchProvider.provider})` : ''}.\n- Web results are only source leads; they are not turned into Product records until product identity, specifications and image rights are verified.\n\n`;
  const independentStatusTable = `## Independent verification status by category\n\nCounts combine Product records and active PendingProduct records. Verification status and publication status are separate fields.\n\n| Category | Records | Model verified | Image verified | URL verified | Published | Publication pending | Hidden |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${coverage.verificationByCategory.map((row: any) => `| ${row.category} | ${row.records} | ${row.productVerified} | ${row.imageVerified} | ${row.urlVerified} | ${row.published} | ${row.publicationPending} | ${row.hidden} |`).join('\n')}\n\n`;
  const completeReport = reportWithStatusSummary.replace('## Coverage by category, brand, and family', `${urlVerificationNote}${pendingResearchNote}${liveSearchProviderNote}${independentStatusTable}## Coverage by category, brand, and family`);
  const importHistory = recentRuns.length
    ? `# Import History\n\nGenerated from MongoDB collection \`${SyncRun.collection.collectionName}\` at ${coverage.generatedAt}. Most recent 100 runs are shown.\n\n| Started | Source | Mode | Status | Fetched | Products imported / updated | Offers updated | Pending | Error |\n|---|---|---|---|---:|---:|---:|---:|---|\n${recentRuns.map((run: any) => `| ${run.startedAt ? new Date(run.startedAt).toISOString() : ''} | ${run.sourceKey ?? run.source} | ${run.mode} | ${run.status} | ${run.stats?.fetched ?? ''} | ${(run.stats?.created ?? 0) + (run.stats?.updated ?? 0)} | ${run.stats?.offersCreatedOrUpdated ?? ''} | ${run.stats?.pendingReview ?? ''} | ${String(run.error ?? '').replace(/\|/g, '\\|').slice(0, 160)} |`).join('\n')}\n`
    : `# Import History\n\nGenerated from MongoDB at ${coverage.generatedAt}.\n\nNo import-run records are currently stored in MongoDB. Existing Product records are preserved; their original import timestamps are not present in the import-history collection.\n`;
  await Promise.all([
    writeFile(resolve(outputRoot, 'PRODUCT_CATALOG_REPORT.md'), completeReport, 'utf8'),
    writeFile(resolve(outputRoot, 'PRODUCT_COVERAGE.json'), JSON.stringify(coverage, null, 2), 'utf8'),
    writeFile(resolve(outputRoot, 'IMPORT_HISTORY.md'), importHistory, 'utf8'),
  ]);
  console.log(JSON.stringify({ ...coverage, urlVerification: urlVerification ? { ...urlVerification, entries: undefined } : null }, null, 2));
  console.log(`Reports written to ${outputRoot}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Catalog audit failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
