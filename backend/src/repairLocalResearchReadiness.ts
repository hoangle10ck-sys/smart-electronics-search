import 'dotenv/config';
import mongoose from 'mongoose';
import { configureLocalEnvironment, LOCAL_DATABASE_NAME } from './localEnvironment';
import { connectDB } from './config/db';
import { Product } from './models/Product';
import { missingRecommendationFields } from './services/catalogReadiness';
import { buildProductDescription } from './services/productDescription';
import { normalizeProduct } from './services/productNormalizer';
import { buildSearchText, normalize } from './utils/text';
import { normalizeSpecs } from './utils/specs';

configureLocalEnvironment();

const EXPANDED_SOURCE_KEYS = [
  'web-research:meta:quest-3',
  'web-research:dji:mini-4-pro',
  'web-research:shure:sm7b',
  'web-research:amd:ryzen-9-5950x',
  'web-research:amd:ryzen-9-5900x',
  'web-research:amd:ryzen-7-5800x3d',
  'web-research:amd:ryzen-7-5800x',
  'web-research:amd:ryzen-7-5700x',
  'web-research:amd:ryzen-5-5600g',
  'web-research:amd:ryzen-7-pro-4750g',
];

async function main() {
  await connectDB();
  try {
    const products = await Product.find({ sourceKey: { $in: EXPANDED_SOURCE_KEYS }, publicationStatus: 'published' }).lean() as any[];
    if (products.length !== EXPANDED_SOURCE_KEYS.length) {
      throw new Error(`Expected ${EXPANDED_SOURCE_KEYS.length} locally published expansion products; found ${products.length}.`);
    }

    const prepared = products.map((product) => {
      const description = buildProductDescription(product.name, product.specifications);
      if (!description) throw new Error(`${product.sourceKey}: verified specifications cannot produce a sourced description.`);
      const sourceEvidence = [...(product.sourceEvidence ?? [])];
      if (!sourceEvidence.some((item: any) => item.evidenceType === 'description' && item.sourceUrl === product.specificationSourceUrl)) {
        sourceEvidence.push({
          evidenceType: 'description', sourceName: 'Description summarized from verified specifications',
          sourceUrl: product.specificationSourceUrl,
          notes: 'Generated only from sourced specification fields; no additional product claims were added.',
          retrievedAt: product.verifiedAt, verifiedAt: product.verifiedAt,
        });
      }
      const specs = normalizeSpecs({ ...product.specs, ...product.specifications });
      const searchText = normalize(buildSearchText({ ...product, description, specs }));
      const normalizedFields = normalizeProduct({ ...product, description, sourceEvidence, searchText, specs });
      const readinessIssues = missingRecommendationFields({ ...product, description, sourceEvidence, searchText, ...normalizedFields });
      if (readinessIssues.length) throw new Error(`${product.sourceKey}: still missing public-readiness fields: ${readinessIssues.join(', ')}.`);
      return { product, description, sourceEvidence, searchText, normalizedFields };
    });

    let repaired = 0;
    for (const item of prepared) {
      await Product.updateOne({ _id: item.product._id }, { $set: {
        description: item.description,
        sourceEvidence: item.sourceEvidence,
        searchText: item.searchText,
        ...item.normalizedFields,
      } });
      repaired += 1;
    }
    console.log(JSON.stringify({ database: LOCAL_DATABASE_NAME, repaired, publicReadiness: 'complete' }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Local catalog readiness repair failed');
  process.exitCode = 1;
});
