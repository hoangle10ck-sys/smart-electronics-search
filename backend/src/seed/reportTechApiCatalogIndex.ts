import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Offer } from '../models/Offer';
import { PendingProduct } from '../models/PendingProduct';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { TechApiCatalogRecord } from '../models/TechApiCatalogRecord';

async function main() {
  await connectDB();
  try {
    const dateKey = new Date().toISOString().slice(0, 10);
    const runKey = `techapi-catalog-index-${dateKey}`;
    await SyncRun.updateMany(
      { source: 'techapi', sourceKey: runKey, status: 'running' },
      { $set: { status: 'failed', finishedAt: new Date(), error: 'Import process stopped before completion; see the next import run.' } }
    );
    const categoryCounts = await TechApiCatalogRecord.aggregate([
      { $group: { _id: '$sourceCategory', records: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const completedRun = await SyncRun.findOne({ source: 'techapi', sourceKey: runKey, status: 'succeeded' }).sort({ createdAt: -1 }).lean();
    const report = {
      checkedAt: new Date().toISOString(),
      database: mongoose.connection.name,
      collection: TechApiCatalogRecord.collection.name,
      totalRecords: await TechApiCatalogRecord.countDocuments(),
      categoryCounts: Object.fromEntries(categoryCounts.map(({ _id, records }) => [_id, records])),
      existingCatalog: {
        products: await Product.countDocuments(),
        pendingProductDocuments: await PendingProduct.countDocuments(),
        activePendingReview: await PendingProduct.countDocuments({ classification: 'pending_review', reviewDecision: null }),
        offers: await Offer.countDocuments(),
      },
      completedImport: completedRun?.stats ?? null,
      attribution: 'Data from TechAPI',
      dataSourceUrl: 'https://github.com/GetTechAPI/TechAPI',
      dataLicense: 'CC BY-SA 4.0',
      dataLicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      workflow: 'discovery_only; not verified or published; source index does not hydrate specifications or authorize image reuse',
    };
    await writeFile(resolve(__dirname, '../../../TECHAPI_CATALOG_INDEX_IMPORT_2026_11_11.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'TechAPI index report failed');
  process.exitCode = 1;
});
