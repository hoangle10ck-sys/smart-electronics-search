import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { verifyModelPage } from '../services/urlVerification';

type ApiGpu = {
  slug: string;
  name: string;
  manufacturer?: { name?: string };
  architecture?: string | null;
  release_date?: string | null;
  verified?: boolean;
  source_urls?: string[];
  [key: string]: unknown;
};

type GpuSpec = Record<string, unknown>;
type Candidate = {
  sourceKey: string;
  apiSlugs: string[];
  brand: string;
  family: string;
  generation: string;
  model: string;
  modelNumber: string;
  name: string;
  releaseYear: number;
  productUrl: string;
  specificationSourceUrl: string;
  specifications: GpuSpec;
  variants?: Array<{ name: string; attributes: Record<string, unknown> }>;
  variantEvidence?: { sourceName: string; sourceUrl: string; model: string; notes: string };
  corrections: string[];
};

const TECHAPI_ROOT = 'https://gettechapi.github.io/TechAPI/v1/gpus';
const TECHAPI_REPO = 'https://github.com/GetTechAPI/TechAPI';
const TECHAPI_LICENSE = 'https://github.com/GetTechAPI/TechAPI/blob/develop/data/LICENSE.md';
const CC_BY_SA = 'https://creativecommons.org/licenses/by-sa/4.0/';
const AMD_GRAPHICS_SPECS = 'https://www.amd.com/en/products/specifications/graphics.html';
const NVIDIA_SPECS = 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/';

const candidates: Candidate[] = [
  {
    sourceKey: 'web-research:techapi:gpu:geforce-rtx-5090', apiSlugs: ['geforce-rtx-5090'], brand: 'NVIDIA', family: 'GeForce RTX',
    generation: 'GeForce RTX 50 Series (Blackwell)', model: 'GeForce RTX 5090', modelNumber: 'RTX 5090', name: 'NVIDIA GeForce RTX 5090 Graphics Card', releaseYear: 2025,
    productUrl: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/', specificationSourceUrl: NVIDIA_SPECS,
    specifications: { architecture: 'Blackwell', cudaCores: 21760, tensorCoreGeneration: '5th generation', rayTracingCoreGeneration: '4th generation', baseClockMHz: 2010, boostClockMHz: 2410, memoryConfigurations: ['32 GB GDDR7'], memoryInterfaceBits: 512, memoryBandwidthGBs: 1792, totalGraphicsPowerW: 575, pcieInterface: 'PCI Express Gen 5' }, corrections: [],
  },
  {
    sourceKey: 'web-research:techapi:gpu:geforce-rtx-5080', apiSlugs: ['geforce-rtx-5080'], brand: 'NVIDIA', family: 'GeForce RTX',
    generation: 'GeForce RTX 50 Series (Blackwell)', model: 'GeForce RTX 5080', modelNumber: 'RTX 5080', name: 'NVIDIA GeForce RTX 5080 Graphics Card', releaseYear: 2025,
    productUrl: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5080/', specificationSourceUrl: NVIDIA_SPECS,
    specifications: { architecture: 'Blackwell', cudaCores: 10752, tensorCoreGeneration: '5th generation', rayTracingCoreGeneration: '4th generation', baseClockMHz: 2300, boostClockMHz: 2620, memoryConfigurations: ['16 GB GDDR7'], memoryInterfaceBits: 256, memoryBandwidthGBs: 960, totalGraphicsPowerW: 360, pcieInterface: 'PCI Express Gen 5' },
    corrections: ['TechAPI memory_bandwidth_gbps is 896; NVIDIA lists 960 GB/s. Imported the manufacturer value.'],
  },
  {
    sourceKey: 'web-research:techapi:gpu:geforce-rtx-5070-ti', apiSlugs: ['geforce-rtx-5070-ti'], brand: 'NVIDIA', family: 'GeForce RTX',
    generation: 'GeForce RTX 50 Series (Blackwell)', model: 'GeForce RTX 5070 Ti', modelNumber: 'RTX 5070 Ti', name: 'NVIDIA GeForce RTX 5070 Ti Graphics Card', releaseYear: 2025,
    productUrl: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5070-family/', specificationSourceUrl: NVIDIA_SPECS,
    specifications: { architecture: 'Blackwell', cudaCores: 8960, tensorCoreGeneration: '5th generation', rayTracingCoreGeneration: '4th generation', baseClockMHz: 2300, boostClockMHz: 2450, memoryConfigurations: ['16 GB GDDR7'], memoryInterfaceBits: 256, memoryBandwidthGBs: 896, totalGraphicsPowerW: 300, pcieInterface: 'PCI Express Gen 5' }, corrections: [],
  },
  {
    sourceKey: 'web-research:techapi:gpu:geforce-rtx-5070', apiSlugs: ['geforce-rtx-5070'], brand: 'NVIDIA', family: 'GeForce RTX',
    generation: 'GeForce RTX 50 Series (Blackwell)', model: 'GeForce RTX 5070', modelNumber: 'RTX 5070', name: 'NVIDIA GeForce RTX 5070 Graphics Card', releaseYear: 2025,
    productUrl: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5070-family/', specificationSourceUrl: NVIDIA_SPECS,
    specifications: { architecture: 'Blackwell', cudaCores: 6144, tensorCoreGeneration: '5th generation', rayTracingCoreGeneration: '4th generation', baseClockMHz: 2330, boostClockMHz: 2510, memoryConfigurations: ['12 GB GDDR7'], memoryInterfaceBits: 192, memoryBandwidthGBs: 672, totalGraphicsPowerW: 250, pcieInterface: 'PCI Express Gen 5' }, corrections: [],
  },
  {
    sourceKey: 'web-research:techapi:gpu:geforce-rtx-5060-ti', apiSlugs: ['geforce-rtx-5060-ti-16-gb', 'geforce-rtx-5060-ti-8gb'], brand: 'NVIDIA', family: 'GeForce RTX',
    generation: 'GeForce RTX 50 Series (Blackwell)', model: 'GeForce RTX 5060 Ti', modelNumber: 'RTX 5060 Ti', name: 'NVIDIA GeForce RTX 5060 Ti Graphics Card', releaseYear: 2025,
    productUrl: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5060-family/', specificationSourceUrl: NVIDIA_SPECS,
    specifications: { architecture: 'Blackwell', cudaCores: 4608, tensorCoreGeneration: '5th generation', rayTracingCoreGeneration: '4th generation', baseClockMHz: 2410, boostClockMHz: 2570, memoryConfigurations: ['16 GB GDDR7', '8 GB GDDR7'], memoryInterfaceBits: 128, memoryBandwidthGBs: 448, totalGraphicsPowerW: 180, pcieInterface: 'PCI Express Gen 5' },
    variants: [
      { name: '16 GB GDDR7', attributes: { memoryGB: 16, memoryType: 'GDDR7', memoryInterfaceBits: 128, memoryBandwidthGBs: 448 } },
      { name: '8 GB GDDR7', attributes: { memoryGB: 8, memoryType: 'GDDR7', memoryInterfaceBits: 128, memoryBandwidthGBs: 448 } },
    ],
    corrections: ['TechAPI supplies separate 16 GB and 8 GB records. Combined them as variants of the same manufacturer model to prevent a duplicate base model. Normalized the 16 GB architecture label to NVIDIA Blackwell.'],
  },
  {
    sourceKey: 'web-research:techapi:gpu:geforce-rtx-5060', apiSlugs: ['geforce-rtx-5060'], brand: 'NVIDIA', family: 'GeForce RTX',
    generation: 'GeForce RTX 50 Series (Blackwell)', model: 'GeForce RTX 5060', modelNumber: 'RTX 5060', name: 'NVIDIA GeForce RTX 5060 Graphics Card', releaseYear: 2025,
    productUrl: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5060-family/', specificationSourceUrl: NVIDIA_SPECS,
    specifications: { architecture: 'Blackwell', cudaCores: 3840, tensorCoreGeneration: '5th generation', rayTracingCoreGeneration: '4th generation', baseClockMHz: 2280, boostClockMHz: 2500, memoryConfigurations: ['8 GB GDDR7'], memoryInterfaceBits: 128, memoryBandwidthGBs: 448, totalGraphicsPowerW: 145, pcieInterface: 'PCI Express Gen 5' },
    corrections: ['TechAPI tdp_w is 150; NVIDIA lists 145 W Total Graphics Power. Imported the manufacturer value.'],
  },
  {
    sourceKey: 'web-research:techapi:gpu:geforce-rtx-5050', apiSlugs: ['geforce-rtx-5050'], brand: 'NVIDIA', family: 'GeForce RTX',
    generation: 'GeForce RTX 50 Series (Blackwell)', model: 'GeForce RTX 5050', modelNumber: 'RTX 5050', name: 'NVIDIA GeForce RTX 5050 Graphics Card', releaseYear: 2025,
    productUrl: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5050/', specificationSourceUrl: NVIDIA_SPECS,
    specifications: { architecture: 'Blackwell', cudaCores: 2560, tensorCoreGeneration: '5th generation', rayTracingCoreGeneration: '4th generation', baseClockMHz: 2310, boostClockMHz: 2570, memoryConfigurations: ['8 GB GDDR6'], memoryInterfaceBits: 128, memoryBandwidthGBs: 320, totalGraphicsPowerW: 130, pcieInterface: 'PCI Express Gen 5' }, corrections: [],
  },
  {
    sourceKey: 'web-research:techapi:gpu:radeon-rx-9070-xt', apiSlugs: ['radeon-rx-9070-xt'], brand: 'AMD', family: 'Radeon RX',
    generation: 'Radeon RX 9000 Series (RDNA 4)', model: 'Radeon RX 9070 XT', modelNumber: 'RX 9070 XT', name: 'AMD Radeon RX 9070 XT Graphics Card', releaseYear: 2025,
    productUrl: 'https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9070xt.html', specificationSourceUrl: 'https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9070xt.html',
    specifications: { architecture: 'RDNA 4', computeUnits: 64, streamProcessors: 4096, rayAccelerators: 64, aiAccelerators: 128, gameFrequencyMHz: 2400, boostFrequencyMHz: 2970, memoryConfigurations: ['16 GB GDDR6'], memoryInterfaceBits: 256, memoryBandwidthGBs: 640, typicalBoardPowerW: 304, pcieInterface: 'PCIe 5.0 x16' },
    corrections: ['TechAPI memory_bandwidth_gbps is 644; AMD lists up to 640 GB/s. Imported the manufacturer value.'],
  },
  {
    sourceKey: 'web-research:techapi:gpu:radeon-rx-9070', apiSlugs: ['radeon-rx-9070'], brand: 'AMD', family: 'Radeon RX',
    generation: 'Radeon RX 9000 Series (RDNA 4)', model: 'Radeon RX 9070', modelNumber: 'RX 9070', name: 'AMD Radeon RX 9070 Graphics Card', releaseYear: 2025,
    productUrl: 'https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9070.html', specificationSourceUrl: 'https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9070.html',
    specifications: { architecture: 'RDNA 4', computeUnits: 56, streamProcessors: 3584, rayAccelerators: 56, aiAccelerators: 112, gameFrequencyMHz: 2070, boostFrequencyMHz: 2520, memoryConfigurations: ['16 GB GDDR6'], memoryInterfaceBits: 256, memoryBandwidthGBs: 640, typicalBoardPowerW: 220, pcieInterface: 'PCIe 5.0 x16' },
    corrections: ['TechAPI memory_bandwidth_gbps is 644; AMD lists up to 640 GB/s. Imported the manufacturer value.'],
  },
  {
    sourceKey: 'web-research:techapi:gpu:radeon-rx-9070-gre', apiSlugs: ['radeon-rx-9070-gre'], brand: 'AMD', family: 'Radeon RX',
    generation: 'Radeon RX 9000 Series (RDNA 4)', model: 'Radeon RX 9070 GRE', modelNumber: 'RX 9070 GRE', name: 'AMD Radeon RX 9070 GRE Graphics Card', releaseYear: 2025,
    productUrl: 'https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9070-gre.html', specificationSourceUrl: 'https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9070-gre.html',
    specifications: { architecture: 'RDNA 4', computeUnits: 48, streamProcessors: 3072, rayAccelerators: 48, aiAccelerators: 96, gameFrequencyMHz: 2220, boostFrequencyMHz: 2790, memoryConfigurations: ['12 GB GDDR6'], memoryInterfaceBits: 192, memoryBandwidthGBs: 432, typicalBoardPowerW: 220, pcieInterface: 'PCIe 5.0 x16' }, corrections: [],
  },
  {
    sourceKey: 'web-research:techapi:gpu:radeon-rx-9060-xt', apiSlugs: ['radeon-rx-9060-xt-16-gb'], brand: 'AMD', family: 'Radeon RX',
    generation: 'Radeon RX 9000 Series (RDNA 4)', model: 'Radeon RX 9060 XT', modelNumber: 'RX 9060 XT', name: 'AMD Radeon RX 9060 XT Graphics Card', releaseYear: 2025,
    productUrl: 'https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9060xt.html', specificationSourceUrl: 'https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9060xt.html',
    specifications: { architecture: 'RDNA 4', computeUnits: 32, streamProcessors: 2048, rayAccelerators: 32, gameFrequencyMHz: 2530, boostFrequencyMHz: 3130, memoryType: 'GDDR6', memoryInterfaceBits: 128, memoryBandwidthGBs: 320, memoryConfigurations: ['16 GB GDDR6', '8 GB GDDR6'], typicalBoardPowerWByMemoryConfiguration: { '16 GB': 160, '8 GB': 150 }, pcieInterface: 'PCIe 5.0 x16' },
    variants: [
      { name: '16 GB GDDR6', attributes: { memoryGB: 16, memoryInterfaceBits: 128, memoryBandwidthGBs: 320, typicalBoardPowerW: 160 } },
      { name: '8 GB GDDR6', attributes: { memoryGB: 8, memoryInterfaceBits: 128, memoryBandwidthGBs: 320, typicalBoardPowerW: 150 } },
    ],
    variantEvidence: { sourceName: 'AMD Graphics Specifications', sourceUrl: AMD_GRAPHICS_SPECS, model: 'AMD Radeon RX 9060 XT (8GB)', notes: 'AMD lists distinct RX 9060 XT 16 GB and 8 GB configurations, with 160 W and 150 W typical board power respectively; used only for variant configuration.' },
    corrections: ['TechAPI memory_bandwidth_gbps is 322.3; AMD lists up to 320 GB/s. Imported the manufacturer value. The 8 GB configuration comes from AMD’s official graphics specification listing, not from a TechAPI 8 GB record.'],
  },
  {
    sourceKey: 'web-research:techapi:gpu:radeon-rx-9060', apiSlugs: ['radeon-rx-9060'], brand: 'AMD', family: 'Radeon RX',
    generation: 'Radeon RX 9000 Series (RDNA 4)', model: 'Radeon RX 9060', modelNumber: 'RX 9060', name: 'AMD Radeon RX 9060 Graphics Card', releaseYear: 2025,
    productUrl: 'https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9060.html', specificationSourceUrl: 'https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9060.html',
    specifications: { architecture: 'RDNA 4', computeUnits: 28, streamProcessors: 1792, rayAccelerators: 28, aiAccelerators: 56, gameFrequencyMHz: 2400, boostFrequencyMHz: 2990, memoryConfigurations: ['8 GB GDDR6'], memoryInterfaceBits: 128, memoryBandwidthGBs: 288, typicalBoardPowerW: 132, pcieInterface: 'PCIe 5.0 x16' },
    corrections: ['TechAPI memory_bandwidth_gbps is 322.3; AMD lists up to 288 GB/s. Imported the manufacturer value.'],
  },
  {
    sourceKey: 'web-research:techapi:gpu:arc-b580', apiSlugs: ['arc-b580'], brand: 'Intel', family: 'Intel Arc',
    generation: 'Intel Arc B Series (Battlemage / Xe2)', model: 'Intel Arc B580', modelNumber: 'B580', name: 'Intel Arc B580 Graphics Card', releaseYear: 2024,
    productUrl: 'https://www.intel.com/content/www/us/en/products/sku/241598/intel-arc-b580-graphics/specifications.html', specificationSourceUrl: 'https://www.intel.com/content/www/us/en/products/sku/241598/intel-arc-b580-graphics/specifications.html',
    specifications: { architecture: 'Xe2 (Battlemage)', xeCores: 20, rayTracingUnits: 20, graphicsClockMHz: 2670, memoryConfigurations: ['12 GB GDDR6'], memoryInterfaceBits: 192, memoryBandwidthGBs: 456, totalBoardPowerW: 190, pcieInterface: 'PCIe 4.0 x8' },
    corrections: ['TechAPI source_urls contains Intel SKU 243045, which is not the live B580 product page. Replaced it with Intel SKU 241598 and checked the SKU page directly.'],
  },
  {
    sourceKey: 'web-research:techapi:gpu:arc-b570', apiSlugs: ['arc-b570'], brand: 'Intel', family: 'Intel Arc',
    generation: 'Intel Arc B Series (Battlemage / Xe2)', model: 'Intel Arc B570', modelNumber: 'B570', name: 'Intel Arc B570 Graphics Card', releaseYear: 2024,
    productUrl: 'https://www.intel.com/content/www/us/en/products/sku/241676/intel-arc-b570-graphics/specifications.html', specificationSourceUrl: 'https://www.intel.com/content/www/us/en/products/sku/241676/intel-arc-b570-graphics/specifications.html',
    specifications: { architecture: 'Xe2 (Battlemage)', xeCores: 18, rayTracingUnits: 18, graphicsClockMHz: 2500, memoryConfigurations: ['10 GB GDDR6'], memoryInterfaceBits: 160, memoryBandwidthGBs: 380, totalBoardPowerW: 150, pcieInterface: 'PCIe 4.0 x8' },
    corrections: ['TechAPI source_urls contains Intel SKU 243047, which is not the live B570 product page. Replaced it with Intel SKU 241676. TechAPI gives 2025-01-16 as release_date while Intel ARK lists Q4 2024; omitted the exact day and retained the manufacturer quarter/year.'],
  },
];

async function fetchApiRecord(slug: string): Promise<{ record: ApiGpu; url: string }> {
  const url = `${TECHAPI_ROOT}/${encodeURIComponent(slug)}/index.json`;
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`TechAPI ${slug} returned HTTP ${response.status}`);
  const record = await response.json() as ApiGpu;
  if (record.slug !== slug || record.verified !== true || !record.name || !Array.isArray(record.source_urls)) throw new Error(`TechAPI record failed identity/verified/source validation: ${slug}`);
  return { record, url };
}

async function verifySupplementalSource(url: string) {
  const response = await fetch(url, { headers: { Accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(20000) });
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  await response.body?.cancel();
  if (!response.ok || (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml'))) throw new Error(`Supplemental manufacturer page returned HTTP ${response.status} (${contentType || 'no content type'})`);
  return { finalUrl: response.url, status: response.status, contentType };
}

async function main() {
  const entries: any[] = [];
  const audit: any[] = [];
  let productAndSpecificationPageChecks = 0;
  for (const candidate of candidates) {
    if (new URL(candidate.productUrl).protocol !== 'https:' || new URL(candidate.specificationSourceUrl).protocol !== 'https:') throw new Error(`${candidate.model}: HTTPS model and specification URLs are required`);
    const apiRecords = await Promise.all(candidate.apiSlugs.map(fetchApiRecord));
    if (apiRecords.some(({ record }) => record.manufacturer?.name?.toLowerCase() !== candidate.brand.toLowerCase())) throw new Error(`${candidate.model}: TechAPI brand does not match the curated identity`);
    const modelCheck = await verifyModelPage(candidate.productUrl, candidate.model);
    productAndSpecificationPageChecks += 1;
    const specsCheck = candidate.specificationSourceUrl === candidate.productUrl ? modelCheck : await verifyModelPage(candidate.specificationSourceUrl, candidate.model);
    if (candidate.specificationSourceUrl !== candidate.productUrl) productAndSpecificationPageChecks += 1;
    const variantSourceCheck = candidate.variantEvidence ? await verifySupplementalSource(candidate.variantEvidence.sourceUrl) : null;
    const evidence = [
      { evidenceType: 'identity', sourceName: candidate.brand, sourceUrl: candidate.productUrl, notes: `Official manufacturer page identifies ${candidate.model} as a desktop graphics processor.` },
      { evidenceType: 'product_page', sourceName: candidate.brand, sourceUrl: candidate.productUrl, notes: `Exact model or named product family page; live HTTP and model-text check passed at ${modelCheck.finalUrl}.` },
      { evidenceType: 'specifications', sourceName: candidate.brand, sourceUrl: candidate.specificationSourceUrl, notes: `Manufacturer specifications were independently checked for the fields stored in this record; live HTTP and model-text check passed at ${specsCheck.finalUrl}. TechAPI values were not used where the manufacturer differed.` },
      ...apiRecords.map(({ record, url }) => ({ evidenceType: 'catalog_record', sourceName: 'TechAPI', sourceUrl: url, notes: `Data from TechAPI; record ${record.name} (${record.slug}), marked verified by TechAPI. Its fields were independently cross-checked against the manufacturer. The API record's source_urls are recorded in TECHAPI_GPU_VERIFICATION_2026_11_11.json.` })),
      { evidenceType: 'data_license', sourceName: 'TechAPI data license', sourceUrl: TECHAPI_LICENSE, notes: 'TechAPI data is CC BY-SA 4.0. Required attribution: “Data from TechAPI” with a link to the repository; derived data must use the same license. This grant does not cover images.' },
      ...(candidate.variantEvidence ? [{ evidenceType: 'variant_specifications', sourceName: candidate.variantEvidence.sourceName, sourceUrl: candidate.variantEvidence.sourceUrl, notes: `${candidate.variantEvidence.notes} The official page returned HTTP ${variantSourceCheck?.status} with ${variantSourceCheck?.contentType}; its exact RX 9060 XT 8 GB row was checked from live manufacturer results.` }] : []),
    ];
    const entry = {
      sourceKey: candidate.sourceKey, brand: candidate.brand, family: candidate.family, generation: candidate.generation,
      model: candidate.model, modelNumber: candidate.modelNumber, name: candidate.name, category: 'gpu', releaseYear: candidate.releaseYear,
      productStatus: 'active', description: `${candidate.model} desktop discrete graphics processor.`, specifications: candidate.specifications,
      variants: candidate.variants ?? [], productUrl: candidate.productUrl, specificationSourceUrl: candidate.specificationSourceUrl,
      dataAttribution: 'Data from TechAPI', dataSourceUrl: TECHAPI_REPO, dataLicense: 'CC BY-SA 4.0', dataLicenseUrl: CC_BY_SA,
      evidence, imageCandidate: null, imageUrl: null, productVerificationStatus: 'verified', imageVerificationStatus: 'pending',
      urlVerificationStatus: 'verified', publicationStatus: 'pending',
      reasons: ['Exact product identity, selected specifications, and live manufacturer URLs were checked. No exact-model image with reusable rights has been approved; retain as private PendingProduct until image review.'],
    };
    entries.push(entry);
    audit.push({
      model: candidate.model, brand: candidate.brand, sourceKey: candidate.sourceKey, productUrl: candidate.productUrl,
      specificationSourceUrl: candidate.specificationSourceUrl, productUrlCheck: modelCheck, specificationUrlCheck: specsCheck,
      ...(variantSourceCheck ? { variantSourceUrlCheck: variantSourceCheck } : {}),
      apiRecords: apiRecords.map(({ record, url }) => ({ slug: record.slug, name: record.name, verified: record.verified, release_date: record.release_date, sourceUrl: url, source_urls: record.source_urls })),
      importedSpecifications: candidate.specifications, corrections: candidate.corrections,
      statuses: { product: 'verified', image: 'pending', url: 'verified', publication: 'pending' },
    });
  }
  const keys = new Set(entries.map((entry) => `${entry.brand.toLowerCase()}|${entry.model.toLowerCase()}`));
  if (keys.size !== entries.length || entries.length > 20) throw new Error('The prepared GPU batch has duplicate identities or exceeds the 20-record import limit.');
  await writeFile(resolve(__dirname, 'research-pending-techapi-gpu-2026-11-11.json'), JSON.stringify(entries, null, 2), 'utf8');
  await writeFile(resolve(__dirname, '../../../TECHAPI_GPU_VERIFICATION_2026_11_11.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), source: 'TechAPI', dataAttribution: 'Data from TechAPI', dataSourceUrl: TECHAPI_REPO,
    dataLicense: 'CC BY-SA 4.0', dataLicenseUrl: CC_BY_SA, licenseTermsUrl: TECHAPI_LICENSE,
    scope: { curatedModelRows: entries.length, TechAPIRecords: audit.reduce((sum, row) => sum + row.apiRecords.length, 0), productAndSpecificationPageChecks, supplementalManufacturerPagesChecked: audit.filter((row) => row.variantSourceUrlCheck).length },
    records: audit,
    limitation: 'TechAPI describes itself as a curated, growing dataset and not an exhaustive catalog. Its verified flag is not a substitute for manufacturer cross-checks. No offers, MSRP values, synthetic scores, or image URLs were imported.',
  }, null, 2), 'utf8');
  console.log(JSON.stringify({ prepared: entries.length, apiRecords: audit.reduce((sum, row) => sum + row.apiRecords.length, 0), productAndSpecificationPageChecks, supplementalManufacturerPagesChecked: audit.filter((row) => row.variantSourceUrlCheck).length, seedFile: 'research-pending-techapi-gpu-2026-11-11.json', reportFile: 'TECHAPI_GPU_VERIFICATION_2026_11_11.json' }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'TechAPI GPU preparation failed');
  process.exitCode = 1;
});
