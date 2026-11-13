import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { EMPTY_ADVISOR_REQUIREMENTS, respondToAdvisorTurn } from '../services/productAdvisor';
import { smartSearch } from '../services/searchService';

const SEARCH_CASES = [
  { group: 'phones', query: 'iPhone' },
  { group: 'phones', query: 'Samsung Galaxy smartphone' },
  { group: 'phones', query: 'Xiaomi phone' },
  { group: 'phones', query: 'OPPO phone' },
  { group: 'phones', query: 'vivo phone' },
  { group: 'phones', query: 'realme phone' },
  { group: 'phones', query: 'Google Pixel phone' },
  { group: 'laptops', query: 'ASUS laptop' },
  { group: 'laptops', query: 'Acer laptop' },
  { group: 'laptops', query: 'Lenovo laptop' },
  { group: 'laptops', query: 'HP laptop' },
  { group: 'laptops', query: 'Dell laptop' },
  { group: 'laptops', query: 'MSI laptop' },
  { group: 'processors_graphics', query: 'Intel Core CPU' },
  { group: 'processors_graphics', query: 'AMD Ryzen CPU' },
  { group: 'processors_graphics', query: 'NVIDIA GeForce RTX graphics card' },
  { group: 'processors_graphics', query: 'AMD Radeon graphics card' },
  { group: 'processors_graphics', query: 'Intel Arc graphics card' },
  { group: 'components', query: 'RAM memory kit' },
  { group: 'components', query: 'SSD storage' },
  { group: 'components', query: 'HDD hard drive' },
  { group: 'displays_audio', query: 'gaming monitor 144Hz' },
  { group: 'displays_audio', query: 'tai nghe học online có microphone' },
  { group: 'networking_smart_home', query: 'Wi-Fi router' },
  { group: 'networking_smart_home', query: 'NAS network storage' },
  { group: 'networking_smart_home', query: 'Samsung smart TV' },
  { group: 'peripherals', query: 'keyboard mouse webcam' },
];

async function main() {
  await connectDB();
  try {
    const queries = [];
    for (const test of SEARCH_CASES) {
      const result = await smartSearch(test.query, 5, undefined, { mode: 'hybrid', page: 1 });
      queries.push({
        ...test,
        status: result.items.length ? 'matched_verified_catalog_products' : 'no_verified_catalog_products',
        verifiedProductCount: result.total,
        returnedCount: result.items.length,
        discoveryLeadCount: result.catalogDiscovery?.length ?? 0,
        notes: result.notes,
        results: result.items.map((product: any) => ({
          id: String(product._id), name: product.name, brand: product.brand, model: product.model,
          category: product.category, imageVerificationStatus: product.imageVerificationStatus,
          price: product.bestOffer?.price ?? null, currency: product.bestOffer?.currency ?? null,
        })),
      });
    }

    const advisor: Record<string, unknown>[] = [];
    try {
      const requirements = {
        ...EMPTY_ADVISOR_REQUIREMENTS,
        category: 'laptop',
        brands: ['Lenovo'],
        budgetMax: 20_000_000,
        purpose: 'học lập trình',
        requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: 16 },
        preferences: ['phù hợp học lập trình'],
      };
      const response = await respondToAdvisorTurn({
        intent: 'product_consultation', requirements, history: [],
        latestMessage: 'Mình cần laptop Lenovo học lập trình, RAM 16GB, dưới 20 triệu.',
        previousProductIds: [], clarification: { question: '', needsClarification: false },
      });
      advisor.push({
        case: 'Lenovo laptop, 16 GB RAM, under 20 million VND',
        status: response.products.length ? 'recommended_products' : response.needsClarification ? 'needs_clarification' : 'no_verified_products',
        needsClarification: response.needsClarification,
        recommendationCount: response.products.length,
        products: response.products.map((product: any) => ({ name: product.name, brand: product.brand, model: product.model, price: product.price, category: product.category })),
        reply: response.reply,
      });
    } catch (error) {
      advisor.push({ case: 'Lenovo laptop, 16 GB RAM, under 20 million VND', status: 'error', error: error instanceof Error ? error.message : 'advisor request failed' });
    }
    try {
      const response = await respondToAdvisorTurn({
        intent: 'product_search',
        requirements: { ...EMPTY_ADVISOR_REQUIREMENTS, category: 'phone', brands: ['Apple'], modelIdentifiers: ['iPhone 15'] },
        history: [], latestMessage: 'Tìm đúng mẫu iPhone 15 trong catalog.', previousProductIds: [],
        clarification: { question: '', needsClarification: false },
      });
      advisor.push({
        case: 'Exact existing model iPhone 15',
        status: response.products.length ? 'recommended_products' : response.needsClarification ? 'needs_clarification' : 'no_verified_products',
        needsClarification: response.needsClarification,
        recommendationCount: response.products.length,
        products: response.products.map((product: any) => ({ name: product.name, brand: product.brand, model: product.model, price: product.price, category: product.category })),
        reply: response.reply,
      });
    } catch (error) {
      advisor.push({ case: 'Exact existing model iPhone 15', status: 'error', error: error instanceof Error ? error.message : 'advisor request failed' });
    }

    const matched = queries.filter((row) => row.verifiedProductCount > 0).length;
    const report = {
      generatedAt: new Date().toISOString(),
      database: mongoose.connection.name,
      searchMode: 'hybrid',
      totalQueries: queries.length,
      matchedQueries: matched,
      noVerifiedProductQueries: queries.length - matched,
      advisor,
      queries,
    };
    const projectRoot = resolve(process.cwd(), '..');
    const reportFile = resolve(projectRoot, 'SEARCH_CATALOG_COVERAGE_2026_11_12.json');
    await mkdir(projectRoot, { recursive: true });
    await writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({
      generatedAt: report.generatedAt,
      database: report.database,
      totalQueries: report.totalQueries,
      matchedQueries: report.matchedQueries,
      noVerifiedProductQueries: report.noVerifiedProductQueries,
      advisor,
      zeroResultQueries: queries.filter((row) => row.verifiedProductCount === 0).map(({ group, query }) => ({ group, query })),
      reportFile,
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Search coverage verification failed.');
  await mongoose.disconnect();
  process.exitCode = 1;
});
