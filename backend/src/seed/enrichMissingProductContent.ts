import 'dotenv/config';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';

type ImageEntry = {
  brand: string; model: string; category: string; name: string; productUrl: string;
  imageFile: string; imageUrl: string; imageSource: string; imageSourcePage: string; exactVariantEvidenceUrl: string;
};

const SEED_DIR = resolve(__dirname);
const IMAGE_DIR = resolve(__dirname, '../../../frontend/public/catalog-images');
const DESCRIPTION_EVIDENCE = 'description_synthesized_from_existing_specs';

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
  memoryOptions: 'Tùy chọn bộ nhớ', processorOptions: 'Tùy chọn bộ xử lý',
  graphicsOptions: 'Tùy chọn đồ họa', displayOptions: 'Tùy chọn màn hình',
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

function buildDescription(product: any): string | null {
  const specs = product.specifications && typeof product.specifications === 'object' ? product.specifications : {};
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
  return `Thông số nổi bật của ${product.name}: ${facts.slice(0, 6).join('; ')}.`;
}

function isImageBytes(fileName: string, bytes: Buffer) {
  const extension = fileName.split('.').at(-1)?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === 'webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

async function prepareImage(entry: ImageEntry) {
  if (!/^[-a-z0-9]+\.(jpg|jpeg|webp)$/i.test(entry.imageFile)) throw new Error(`${entry.name}: invalid local image filename`);
  const localPath = resolve(IMAGE_DIR, entry.imageFile);
  if (dirname(localPath) !== IMAGE_DIR) throw new Error(`${entry.name}: image path escapes the catalog image directory`);
  const [bytes, imageStat] = await Promise.all([readFile(localPath), stat(localPath)]);
  if (imageStat.size < 10_000 || !isImageBytes(entry.imageFile, bytes)) throw new Error(`${entry.name}: image is missing, too small, or has the wrong file type`);
  for (const url of [entry.imageUrl, entry.imageSourcePage, entry.exactVariantEvidenceUrl, entry.productUrl]) {
    if (new URL(url).protocol !== 'https:') throw new Error(`${entry.name}: all image and product source URLs must use HTTPS`);
  }
  return { ...entry, localPath: `/catalog-images/${entry.imageFile}` };
}

async function main() {
  const descriptionsOnly = process.argv.includes('--descriptions-only');
  const imageConfig = descriptionsOnly ? [] : JSON.parse(await readFile(resolve(SEED_DIR, 'missing-content-image-2026-11-11.json'), 'utf8')) as ImageEntry[];
  const imageEntries = await Promise.all(imageConfig.map(prepareImage));
  await connectDB();
  const startedAt = new Date();
  try {
    const products = await Product.find({ publicationStatus: 'published', verified: true, description: { $in: [null, ''] } })
      .select('name brand model category description specifications specificationSourceUrl sourceEvidence verifiedAt updatedAt')
      .lean() as any[];
    const descriptions = products.flatMap((product) => {
      if (!product.brand || !product.model || !product.specificationSourceUrl) return [];
      const description = buildDescription(product);
      return description ? [{ product, description }] : [];
    });

    const imageTargets = [];
    for (const entry of imageEntries) {
      const matches = await Product.find({
        brand: entry.brand, model: entry.model, category: entry.category, name: entry.name, productUrl: entry.productUrl,
        publicationStatus: 'published', productVerificationStatus: 'verified',
      }).select('_id brand model category name productUrl imageUrl localOnlyAsset sourceEvidence').lean() as any[];
      if (matches.length !== 1) throw new Error(`${entry.name}: expected one published verified product record, found ${matches.length}`);
      const current = matches[0];
      if (current.imageUrl && !(current.localOnlyAsset === true && current.imageUrl === entry.localPath)) {
        throw new Error(`${entry.name}: record already has a different image; refusing to replace it automatically`);
      }
      imageTargets.push({ entry, product: current });
    }

    if (process.argv.includes('--dry-run')) {
      console.log(JSON.stringify({
        mode: 'dry-run', database: mongoose.connection.name,
        descriptionsToFill: descriptions.length,
        descriptionPreviews: descriptions.slice(0, 12).map(({ product, description }) => ({ name: product.name, description })),
        localImagesToAttach: imageTargets.map(({ entry }) => ({ name: entry.name, file: entry.imageFile, source: entry.imageSource })),
      }, null, 2));
      return;
    }

    const now = new Date();
    let descriptionsUpdated = 0;
    for (const { product, description } of descriptions) {
      const evidenceDate = product.verifiedAt ?? product.updatedAt ?? now;
      const sourceEvidence = [...(product.sourceEvidence ?? [])];
      if (!sourceEvidence.some((item: any) => item.evidenceType === DESCRIPTION_EVIDENCE && item.sourceUrl === product.specificationSourceUrl)) {
        sourceEvidence.push({
          evidenceType: DESCRIPTION_EVIDENCE,
          sourceName: 'Existing product specification record',
          sourceUrl: product.specificationSourceUrl,
          retrievedAt: evidenceDate,
          verifiedAt: evidenceDate,
          notes: 'Description synthesized only from the specifications already stored for this product; no new specifications or claims were added.',
        });
      }
      const result = await Product.updateOne(
        { _id: product._id, publicationStatus: 'published', description: { $in: [null, ''] } },
        { $set: { description, sourceEvidence } },
        { runValidators: true },
      );
      descriptionsUpdated += result.modifiedCount;
    }

    let imagesUpdated = 0;
    for (const { entry, product } of imageTargets) {
      if (product.localOnlyAsset === true && product.imageUrl === entry.localPath) continue;
      const sourceEvidence = [...(product.sourceEvidence ?? [])]
        .filter((item: any) => !['image', 'image_rights', 'image_license', 'image_local_copy'].includes(item.evidenceType));
      sourceEvidence.push({
        evidenceType: 'image_local_copy', sourceName: entry.imageSource, sourceUrl: entry.imageUrl,
        retrievedAt: now, verifiedAt: now,
        notes: `Copied from the public page ${entry.imageSourcePage} after a normal image request succeeded. The product image was visually checked; exact variant evidence is recorded at ${entry.exactVariantEvidenceUrl}. Reuse permission is not verified.`,
      });
      const result = await Product.updateOne({ _id: product._id }, { $set: {
        imageUrl: entry.localPath, localOnlyAsset: true,
        imageSource: entry.imageSource, imageSourceUrl: entry.imageUrl, imageAuthor: null,
        imageRetrievedAt: now, imageUsagePermission: 'not_provided', imagePermissionEvidence: null,
        imageLicense: null, imageLicenseUrl: null, imageAttribution: null,
        imageVisualIdentityChecked: true, imageVerificationStatus: 'pending', sourceEvidence,
      } }, { runValidators: true });
      imagesUpdated += result.modifiedCount;
    }

    const finishedAt = new Date();
    await SyncRun.create({
      source: 'catalog_enrichment', sourceKey: `catalog-content-enrichment:${startedAt.toISOString()}`, mode: 'import', page: 1,
      status: 'succeeded', startedAt, finishedAt,
      stats: { fetched: descriptions.length + imageTargets.length, created: 0, updated: descriptionsUpdated + imagesUpdated, descriptionsUpdated, imagesUpdated, pendingReview: 0 },
    });
    console.log(JSON.stringify({
      database: mongoose.connection.name, descriptionsUpdated, imagesUpdated,
      publishedProductsMissingDescription: await Product.countDocuments({ publicationStatus: 'published', description: { $in: [null, ''] } }),
      publishedProductsMissingImage: await Product.countDocuments({ publicationStatus: 'published', $or: [{ imageUrl: null }, { imageUrl: '' }] }),
      productCount: await Product.countDocuments(),
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Catalog content enrichment failed');
  await mongoose.disconnect();
  process.exitCode = 1;
});
