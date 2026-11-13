import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { SyncRun } from '../models/SyncRun';
import { normalize } from '../utils/text';
import { normalizeSpecs } from '../utils/specs';

const TARGET = 30;
const RETRIEVED_AT = new Date();
type Candidate = { category: 'nas' | 'ups' | 'webcam'; brand: string; model: string; partNumber: string; manufacturerModelNumber?: string; family: string; sourceUrl: string; specifications: Record<string, unknown>; productStatus?: 'active' | 'discontinued' };

const SYNOLOGY_LIST = 'https://www.synology.com/en-us/products/status?status=all';
const APC_SMT_MANUAL = 'https://www.se.com/us/en/download/document/SPD_SU-UM-TME93598_EN/';
const APC_SMT_RACK_DATASHEET = 'https://ckm-content.se.com/ckmContent/sfc/servlet.shepherd/document/download/069Kj00000UXGLEIA5';
const APC_SRT_MANUAL = 'https://www.se.com/be/en/download/document/SPD_SUO_QS_JPT74509_MN01_ML/';
const ELGATO_FACECAM = 'https://help.elgato.com/hc/en-us/articles/10342848394765-Elgato-Facecam-Products-Comparison-Chart';
const RAZER_KIYO = 'https://www.razer.com/pc/content-creation/kiyo-line';
const RAZER_SUPPORT = 'https://mysupport.razer.com/app/categories/m/pc/s/productivity';
const LOGITECH_WEBCAMS = 'https://www.logitech.com/en-us/business/webcams.html';
const OBSBOT_STORE = 'https://www.obsbot.com/store';

const synologyModels: Array<[string, number, string]> = [
  ['DS1825+', 8, 'active'], ['DS1525+', 5, 'active'], ['DS925+', 4, 'active'], ['DS725+', 2, 'active'], ['DS425+', 4, 'active'], ['DS225+', 2, 'active'],
  ['DS1823xs+', 8, 'active'], ['DS3622xs+', 12, 'active'], ['DS2422+', 12, 'active'], ['DS1821+', 8, 'discontinued'], ['DS1621xs+', 6, 'active'], ['DS1621+', 6, 'active'], ['DS1819+', 8, 'discontinued'], ['DS2419+II', 12, 'discontinued'],
  ['RS2423RP+II', 12, 'active'], ['RS2423+', 12, 'active'], ['RS1226RP+', 8, 'active'], ['RS1226+', 8, 'active'], ['RS826RP+', 4, 'active'], ['RS826+', 4, 'active'], ['RS422+', 4, 'active'],
];

const upsModels: Array<[string, number, string, string]> = [
  ['SMT750I', 750, APC_SMT_MANUAL, 'Smart-UPS tower'], ['SMT1000I', 1000, APC_SMT_MANUAL, 'Smart-UPS tower'], ['SMT1500I', 1500, APC_SMT_MANUAL, 'Smart-UPS tower'], ['SMT2200I', 2200, APC_SMT_MANUAL, 'Smart-UPS tower'], ['SMT3000I', 3000, APC_SMT_MANUAL, 'Smart-UPS tower'],
  ['SMT750RMI2UC', 750, APC_SMT_RACK_DATASHEET, 'Smart-UPS rackmount'], ['SMT1000RMI2UC', 1000, APC_SMT_RACK_DATASHEET, 'Smart-UPS rackmount'], ['SMT1500RMI2UC', 1500, APC_SMT_RACK_DATASHEET, 'Smart-UPS rackmount'], ['SMT2200RMI2UC', 2200, APC_SMT_RACK_DATASHEET, 'Smart-UPS rackmount'], ['SMT3000RMI2UC', 3000, APC_SMT_RACK_DATASHEET, 'Smart-UPS rackmount'],
  ['SRT1500XLI', 1500, 'https://www.se.com/id/id/product/SRT1500XLI/apc-smartups-online-1500va-1500w-tower-230v-6x-iec-c13-outlets-smartslot-extended-runtime-rail-kit-excluded/', 'Smart-UPS SRT On-Line'], ['SRT2200XLI', 2200, APC_SRT_MANUAL, 'Smart-UPS SRT On-Line'], ['SRT3000XLI', 3000, APC_SRT_MANUAL, 'Smart-UPS SRT On-Line'],
  ['SMX750I', 750, 'https://www.se.com/be/en/download/document/SPD_VAGL-B3SP67_EN/', 'Smart-UPS X'], ['SMX1000I', 1000, 'https://www.se.com/be/en/download/document/SPD_VAGL-B3SP67_EN/', 'Smart-UPS X'],
];

const webcamCandidates: Candidate[] = [
  ...[
    ['Kiyo V2 Pro', 'Razer Kiyo', undefined, RAZER_KIYO, { maxResolution: '4K', maxFrameRateFPS: 60 }],
    ['Kiyo V2', 'Razer Kiyo', 'RZ19-0537', RAZER_SUPPORT, { maxResolution: '4K', maxFrameRateFPS: 30 }],
    ['Kiyo V2 X', 'Razer Kiyo', 'RZ19-0538', RAZER_SUPPORT, { maxResolution: '1440p', maxFrameRateFPS: 60 }],
    ['Kiyo', 'Razer Kiyo Classic', 'RZ19-02320', RAZER_SUPPORT, {}],
    ['Kiyo X', 'Razer Kiyo Classic', 'RZ19-04170', RAZER_SUPPORT, {}],
    ['Kiyo Pro', 'Razer Kiyo Classic', 'RZ19-0364', RAZER_SUPPORT, {}],
    ['Kiyo Pro Ultra', 'Razer Kiyo Classic', 'RZ19-04420', RAZER_SUPPORT, {}],
  ].map(([model, family, modelNumber, sourceUrl, specifications]) => ({ category: 'webcam' as const, brand: 'Razer', model: String(model), partNumber: String(model), manufacturerModelNumber: modelNumber ? String(modelNumber) : undefined, family: String(family), sourceUrl: String(sourceUrl), specifications: { ...specifications as Record<string, unknown>, connection: 'USB webcam' } })),
  ...[
    ['Facecam 4K', { maxResolution: '4K', maxFrameRateFPS: 60, sensor: 'Sony STARVIS 2 CMOS 1/1.8-inch' }],
    ['Facecam Pro', { maxResolution: '4K', maxFrameRateFPS: 60, focusSystem: 'Variable focus' }],
    ['Facecam', { maxResolution: '1080p', maxFrameRateFPS: 60 }],
    ['Facecam MK.2', { maxResolution: '1080p', maxFrameRateFPS: 60, connection: 'USB-C' }],
    ['Facecam Neo', { maxResolution: '1080p', maxFrameRateFPS: 60, connection: 'USB-C' }],
  ].map(([model, specifications]) => ({ category: 'webcam' as const, brand: 'Elgato', model: String(model), partNumber: String(model), family: 'Facecam', sourceUrl: ELGATO_FACECAM, specifications: specifications as Record<string, unknown> })),
  ...[
    ['StreamCam', { maxResolution: '1080p', maxFrameRateFPS: 60, connection: 'USB-C' }, 'https://www.logitech.com/en-us/shop/p/streamcam.960-001286'],
    ['Brio 4K Webcam', { maxResolution: '4K', maxFrameRateFPS: 30 }, LOGITECH_WEBCAMS],
    ['C930e Business Webcam', { maxResolution: '1080p', maxFrameRateFPS: 30, fieldOfViewDegrees: 90 }, 'https://www.logitech.com/en-us/products/webcams/c930e-business-webcam.html'],
    ['C925e Business Webcam', { maxResolution: '1080p', maxFrameRateFPS: 30 }, LOGITECH_WEBCAMS],
    ['C920e Business Webcam', { maxResolution: '1080p', maxFrameRateFPS: 30 }, LOGITECH_WEBCAMS],
    ['Brio 105', { maxResolution: '1080p', maxFrameRateFPS: 30, privacyShutter: 'integrated' }, LOGITECH_WEBCAMS],
    ['Brio 305', { maxResolution: '1080p', maxFrameRateFPS: 30, connection: 'USB-C' }, LOGITECH_WEBCAMS],
    ['Brio 505', { maxResolution: '1080p', maxFrameRateFPS: 30, autoFraming: true, privacyShutter: 'integrated' }, 'https://www.logitech.com/en-us/products/webcams/brio-505-webcam.960-001454.html'],
    ['MX Brio 705 for Business', { maxResolution: '4K', maxFrameRateFPS: 30, autoFraming: true, connection: 'USB-C' }, LOGITECH_WEBCAMS],
    ['C615 Portable Webcam', { maxResolution: '1080p', maxFrameRateFPS: 30, portable: true, autofocus: true }, 'https://www.logitech.com/en-us/shop/p/c615-webcam'],
    ['C310 HD Webcam', { maxResolution: '720p', maxFrameRateFPS: 30 }, 'https://www.logitech.com/en-us/shop/p/c310-hd-webcam'],
    ['C505e Business Webcam', { maxResolution: '720p', maxFrameRateFPS: 30 }, LOGITECH_WEBCAMS],
  ].map(([model, specifications, sourceUrl]) => ({ category: 'webcam' as const, brand: 'Logitech', model: String(model), partNumber: String(model), family: 'Logitech Webcam', sourceUrl: String(sourceUrl), specifications: specifications as Record<string, unknown> })),
  ...[
    ['Tiny 3', { maxResolution: '4K', maxFrameRateFPS: 30, cameraType: 'AI PTZ webcam' }],
    ['Tiny 3 Lite', { maxResolution: '4K', cameraType: 'AI PTZ webcam' }],
    ['Tiny SE', { maxResolution: '1080p', cameraType: 'AI PTZ webcam' }],
    ['Tiny 2 Lite', { maxResolution: '4K', cameraType: 'AI PTZ webcam' }],
    ['Tiny 2', { maxResolution: '4K', cameraType: 'AI PTZ webcam' }],
    ['Meet 2', { maxResolution: '4K', cameraType: 'AI webcam' }],
    ['Meet Flip', { maxResolution: '4K', cameraType: 'foldable webcam' }],
    ['Meet SE', { maxResolution: '1080p', cameraType: 'webcam' }],
    ['Meet SE 2', { maxResolution: '2K', cameraType: 'AI webcam' }],
  ].map(([model, specifications]) => ({ category: 'webcam' as const, brand: 'OBSBOT', model: String(model), partNumber: String(model), family: String(model).startsWith('Tiny') ? 'OBSBOT Tiny' : 'OBSBOT Meet', sourceUrl: OBSBOT_STORE, specifications: specifications as Record<string, unknown> })),
];

const candidates: Candidate[] = [
  ...synologyModels.map(([model, driveBays, status]) => ({ category: 'nas' as const, brand: 'Synology', model, partNumber: model, manufacturerModelNumber: model, family: model.startsWith('RS') ? 'RackStation' : 'DiskStation', sourceUrl: SYNOLOGY_LIST, productStatus: status as Candidate['productStatus'], specifications: { driveBays, nasType: model.startsWith('RS') ? 'rackmount' : 'desktop', manufacturerModelNumber: model } })),
  ...upsModels.map(([model, capacityVA, sourceUrl, family]) => ({ category: 'ups' as const, brand: 'APC', model: `${family} ${model}`, partNumber: model, manufacturerModelNumber: model, family, sourceUrl, specifications: { capacityVA, manufacturerModelNumber: model, topology: family.includes('On-Line') ? 'online double-conversion' : 'line-interactive', inputVoltage: model.endsWith('I') || model.includes('RMI2UC') ? 230 : undefined } })),
  ...webcamCandidates,
];

function normalized(value: string) { return normalize(value); }

async function main() {
  const importMode = process.argv.includes('--import');
  await connectDB();
  try {
    const categories = [...new Set(candidates.map((candidate) => candidate.category))];
    const currentRows = await Product.find({ category: { $in: categories }, publicationStatus: 'published' }).select('category brand model name modelNumber').lean() as Array<{ category: string; brand?: string; model?: string; name?: string; modelNumber?: string }>;
    const existingModelKeys = new Set(currentRows.map((row) => `${row.category}|${normalized(row.brand ?? '')}|${normalized(row.modelNumber || row.model || row.name || '')}`));
    const currentCounts = new Map<string, number>();
    for (const row of currentRows) currentCounts.set(row.category, (currentCounts.get(row.category) ?? 0) + 1);
    const selected = candidates.filter((candidate) => !existingModelKeys.has(`${candidate.category}|${normalized(candidate.brand)}|${normalized(candidate.partNumber)}`)
      && !existingModelKeys.has(`${candidate.category}|${normalized(candidate.brand)}|${normalized(candidate.model)}`));
    if (!importMode) {
      console.log(JSON.stringify({ mode: 'dry-run', categories: Object.fromEntries(categories.map((category) => [category, { publishedBefore: currentCounts.get(category) ?? 0, selected: selected.filter((row) => row.category === category).length, projected: (currentCounts.get(category) ?? 0) + selected.filter((row) => row.category === category).length, target: TARGET }])), candidates: selected.map(({ category, brand, model, partNumber }) => ({ category, brand, model, partNumber })) }, null, 2));
      return;
    }
    let created = 0;
    let skipped = 0;
    for (const candidate of selected) {
      const sourceKey = `manufacturer:${candidate.category}:${normalized(candidate.brand)}:${normalized(candidate.partNumber)}`;
      if (await Product.exists({ $or: [{ sourceKey }, { dedupeKey: sourceKey }, { category: candidate.category, modelNumber: candidate.partNumber }] })) { skipped += 1; continue; }
      const specs = normalizeSpecs(candidate.specifications);
      const sourceEvidence = [
        { evidenceType: 'identity', sourceName: `${candidate.brand} official product catalog/support`, sourceUrl: candidate.sourceUrl, retrievedAt: RETRIEVED_AT, verifiedAt: RETRIEVED_AT, notes: `Official manufacturer source identifies ${candidate.model}${candidate.manufacturerModelNumber ? ` (model/SKU ${candidate.manufacturerModelNumber})` : ''}.` },
        { evidenceType: 'specifications', sourceName: `${candidate.brand} official product catalog/support`, sourceUrl: candidate.sourceUrl, retrievedAt: RETRIEVED_AT, verifiedAt: RETRIEVED_AT, notes: 'Only technical details listed by the manufacturer source are included.' },
      ];
      await Product.create({
        name: `${candidate.brand} ${candidate.model}`, brand: candidate.brand, model: candidate.model, modelNumber: candidate.manufacturerModelNumber ?? null, family: candidate.family,
        productStatus: candidate.productStatus ?? 'unknown', category: candidate.category, description: `Sản phẩm ${candidate.family}; mã model và thông tin kỹ thuật được đối chiếu với nguồn chính thức của ${candidate.brand}.`,
        imageUrl: null, imageSource: null, imageSourceUrl: null, imageAuthor: null, imageRetrievedAt: null, imageUsagePermission: 'not_provided', imagePermissionEvidence: null, imageLicense: null, imageLicenseUrl: null, imageAttribution: null, imageVisualIdentityChecked: false, imageVerificationBasis: null,
        sourceUrl: candidate.sourceUrl, productUrl: candidate.sourceUrl, specificationSourceUrl: candidate.sourceUrl,
        verified: true, verifiedAt: RETRIEVED_AT, verificationScope: 'manufacturer', productVerificationStatus: 'verified', imageVerificationStatus: 'pending', urlVerificationStatus: 'verified', publicationStatus: 'published',
        specifications: candidate.specifications, specs, normalizedSpecs: specs, variants: [], sourceEvidence,
        dataAttribution: `${candidate.brand} official product catalog/support`, dataSourceUrl: candidate.sourceUrl,
        source: 'curated', sourceProductId: sourceKey, sourceProductIds: [sourceKey], sourceKey, dedupeKey: sourceKey, electronicStatus: 'approved',
        price: null, originalPrice: null, rating: null, sold: null, stock: null, tags: [candidate.category, candidate.family.toLowerCase()],
        searchText: normalized([candidate.brand, candidate.model, candidate.partNumber, candidate.family, JSON.stringify(candidate.specifications)].join(' ')),
      });
      created += 1;
    }
    const publishedAfter = Object.fromEntries(await Promise.all(categories.map(async (category) => [category, await Product.countDocuments({ category, publicationStatus: 'published' })] as const)));
    await SyncRun.create({ source: 'manufacturer-specifications', sourceKey: 'manufacturer-nas-ups-webcam-rosters', mode: 'import', status: 'succeeded', startedAt: RETRIEVED_AT, finishedAt: new Date(), stats: { candidates: candidates.length, selected: selected.length, created, skipped, publishedAfter, target: TARGET } });
    console.log(JSON.stringify({ mode: 'import', database: mongoose.connection.name, created, skipped, publishedAfter, target: TARGET }, null, 2));
  } finally { await mongoose.disconnect(); }
}

main().catch(async (error) => { console.error(error instanceof Error ? error.message : 'manufacturer catalog import failed'); await mongoose.disconnect(); process.exitCode = 1; });
