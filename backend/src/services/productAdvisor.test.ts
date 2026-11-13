import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AdvisorRequirements, EMPTY_ADVISOR_REQUIREMENTS, buildAdvisorSearchQuery, buildFallbackAdvisorReply, evaluateAdvisorFit,
  buildNoResultReply, formatVnd, getAdvisorClarification, isAdvisorTurnInScope, matchesAdvisorExclusion, mergeAdvisorRequirements, resolveAdvisorIntent, respondToAdvisorTurn,
  isExplicitHistoricalReference,
} from './productAdvisor';

function modelAnalysis(requirements: AdvisorRequirements, intent: 'product_consultation' | 'budget_consultation' = 'product_consultation') {
  return { intent, inScope: true, clearBudget: false, requirements } as any;
}

test('advisor merges separate turns and updates budget without losing earlier requirements', () => {
  const first = mergeAdvisorRequirements(
    EMPTY_ADVISOR_REQUIREMENTS,
    modelAnalysis({ ...EMPTY_ADVISOR_REQUIREMENTS, category: 'laptop', purpose: 'lập trình' }),
    'Tôi muốn mua laptop để lập trình',
  );
  assert.equal(first.category, 'laptop');
  assert.equal(first.purpose, 'lập trình');

  const second = mergeAdvisorRequirements(
    first,
    modelAnalysis({ ...first, budgetMin: 16_000_000, budgetMax: 24_000_000 }, 'budget_consultation'),
    'Tăng ngân sách lên 25 triệu',
  );
  assert.equal(second.category, 'laptop');
  assert.equal(second.purpose, 'lập trình');
  assert.equal(second.budgetMin, 16_000_000);
  assert.equal(second.budgetMax, 25_000_000);
});

test('advisor asks one essential question at a time', () => {
  const categoryOnly = { ...EMPTY_ADVISOR_REQUIREMENTS, category: 'laptop' };
  const purposeQuestion = getAdvisorClarification('product_consultation', categoryOnly, false);
  assert.equal(purposeQuestion.needsClarification, true);
  assert.match(purposeQuestion.question, /dùng laptop chủ yếu/i);

  const purposeKnown = { ...categoryOnly, purpose: 'lập trình' };
  const budgetQuestion = getAdvisorClarification('product_consultation', purposeKnown, false);
  assert.equal(budgetQuestion.needsClarification, true);
  assert.match(budgetQuestion.question, /ngân sách/i);

  const requirements = { ...purposeKnown, budgetMax: 20_000_000 };
  assert.equal(getAdvisorClarification('product_consultation', requirements, false).needsClarification, false);
});

test('advisor resolves short budget and comparison replies from conversation context', () => {
  assert.equal(resolveAdvisorIntent('greeting', 'Khoảng 20 triệu', true, false, true), 'budget_consultation');
  assert.equal(resolveAdvisorIntent('unknown', 'So sánh hai mẫu đầu tiên', true, true, true), 'product_comparison');
  assert.equal(resolveAdvisorIntent('unknown', 'Xin chào', false, false, false), 'greeting');
});

test('advisor rejects unrelated topics while keeping greetings, product turns, and repair prompts in scope', () => {
  assert.equal(isAdvisorTurnInScope('Tell me a joke about politics', EMPTY_ADVISOR_REQUIREMENTS, false), false);
  assert.equal(isAdvisorTurnInScope('Tôi muốn mua laptop', EMPTY_ADVISOR_REQUIREMENTS, false), true);
  assert.equal(isAdvisorTurnInScope('Khoảng 20 triệu', { ...EMPTY_ADVISOR_REQUIREMENTS, category: 'laptop' }, true), true);
  assert.equal(isAdvisorTurnInScope('Xin chào', EMPTY_ADVISOR_REQUIREMENTS, false), true);
  assert.equal(isAdvisorTurnInScope('av123', EMPTY_ADVISOR_REQUIREMENTS, false), true);
});

test('advisor builds a search query from stored purpose, budget, and hard specs', () => {
  const requirements: AdvisorRequirements = {
    ...EMPTY_ADVISOR_REQUIREMENTS,
    category: 'laptop', brands: ['Lenovo'], budgetMax: 20_000_000, purpose: 'lập trình',
    requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: 16, storageGB: 512, storageType: 'ssd' },
  };
  const query = buildAdvisorSearchQuery(requirements, 'Mình thường chạy Docker');
  assert.match(query, /laptop/i);
  assert.match(query, /Lenovo/i);
  assert.match(query, /20 trieu/i);
  assert.match(query, /RAM 16GB/i);
  assert.match(query, /512GB SSD/i);
});

test('advisor no-result replies keep the exact VND budget and requested criteria', () => {
  const requirements: AdvisorRequirements = {
    ...EMPTY_ADVISOR_REQUIREMENTS,
    category: 'laptop', brands: ['Lenovo'], budgetMax: 20_000_000, purpose: 'học lập trình',
    requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: 16 },
  };
  assert.equal(formatVnd(20_000_000), '20.000.000');
  const reply = buildNoResultReply(requirements);
  assert.match(reply, /Lenovo/);
  assert.match(reply, /RAM 16 GB/);
  assert.match(reply, /20\.000\.000 VND/);
  assert.doesNotMatch(reply, /2:000\.000/);
});

test('advisor can describe verified catalog candidates when Ollama is unavailable', () => {
  const reply = buildFallbackAdvisorReply([{
    name: 'Apple iPhone 15',
    bestOffer: {
      verified: true, priceVerificationStatus: 'verified', priceStatus: 'current_verified', currency: 'VND', price: 18_990_000,
      productUrl: 'https://shop.example/iphone-15', observedAt: new Date().toISOString(),
    },
  }]);
  assert.match(reply, /Apple iPhone 15/);
  assert.match(reply, /18\.990\.000 VND/);
  assert.match(reply, /nguồn xác minh/);
});

test('fit score uses verified price/spec facts and marks unknown prices honestly', () => {
  const requirements: AdvisorRequirements = {
    ...EMPTY_ADVISOR_REQUIREMENTS,
    category: 'laptop', brands: ['Lenovo'], budgetMax: 20_000_000, purpose: 'lập trình',
    requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: 16 },
  };
  const product = {
    _id: 'verified-laptop', verified: true, publicationStatus: 'published', category: 'laptop', brand: 'Lenovo',
    productUrl: 'https://manufacturer.example/verified-laptop', specificationSourceUrl: 'https://manufacturer.example/verified-laptop/specs',
    bestOffer: {
      verified: true, priceVerificationStatus: 'verified', priceStatus: 'current_verified', currency: 'VND', price: 18_000_000,
      productUrl: 'https://shop.example/verified-laptop', sourceRetrievedAt: new Date(),
    }, normalizedSpecs: { ramGB: 16 },
    tags: ['programming'], reasons: ['Phù hợp nhu cầu: lập trình'],
  };
  const fit = evaluateAdvisorFit(product, requirements);
  assert.equal(fit.score, 100);
  assert.equal(fit.budgetStatus, 'within_budget');
  assert.ok(fit.reasons.some((reason) => /nằm trong ngân sách/i.test(reason)));

  const noPrice = evaluateAdvisorFit({ ...product, bestOffer: null }, requirements);
  assert.ok(noPrice.score < fit.score);
  assert.equal(noPrice.budgetStatus, 'price_unknown');
  assert.ok(noPrice.reasons.some((reason) => /chưa có giá/i.test(reason)));
});

test('advisor excludes products that conflict with an explicit avoid criterion', () => {
  const product = { name: 'Laptop Example', specifications: { display: '15.6 inch OLED' }, specs: {} };
  assert.equal(matchesAdvisorExclusion(product, ['không muốn màn hình OLED']), true);
  assert.equal(matchesAdvisorExclusion(product, ['webcam']), false);
});

function advisorProductFixture(id: string, name: string, price: number, category = 'laptop') {
  return {
    _id: id, name, model: name, brand: 'Lenovo', category,
    verified: true, verifiedAt: new Date(), productVerificationStatus: 'verified', urlVerificationStatus: 'verified',
    publicationStatus: 'published', electronicStatus: 'approved', source: 'curated',
    productUrl: `https://manufacturer.example/${id}`, specificationSourceUrl: `https://manufacturer.example/${id}/specs`,
    bestOffer: {
      verified: true, priceVerificationStatus: 'verified', priceStatus: 'current_verified', currency: 'VND', price,
      sellerName: 'Verified seller', productUrl: `https://shop.example/${id}`, observedAt: new Date(), verifiedAt: new Date(),
    },
    offers: [], specs: {}, normalizedSpecs: {}, tags: ['programming'], score: 10, reasons: [],
  };
}

const advisorRequest = {
  intent: 'product_search',
  requirements: {
    ...EMPTY_ADVISOR_REQUIREMENTS, category: 'laptop', brands: ['Lenovo'], budgetMax: 20_000_000, purpose: 'programming',
  },
  history: [], latestMessage: 'Tìm laptop Lenovo dưới 20 triệu để lập trình', previousProductIds: [],
  clarification: { needsClarification: false, question: '' },
};

test('stream callback receives only the backend-evaluated current product cards for a multi-result search', async () => {
  const candidates = [
    advisorProductFixture('64a000000000000000000001', 'Lenovo verified A', 18_000_000),
    advisorProductFixture('64a000000000000000000002', 'Lenovo verified B', 19_000_000),
    advisorProductFixture('64a000000000000000000003', 'Non-laptop fixture', 15_000_000, 'phone'),
  ];
  let streamedProducts: any[] = [];
  const result = await respondToAdvisorTurn({
    ...advisorRequest,
    searchProducts: async () => ({ items: candidates, budgetUnknownItems: [], notes: [] }),
    onVerifiedProducts: (products: any[]) => { streamedProducts = products; },
  });
  assert.equal(result.searchPerformed, true);
  assert.equal(result.products.length, 2);
  assert.deepEqual(streamedProducts.map((product) => product.name), ['Lenovo verified A', 'Lenovo verified B']);
  assert.ok(streamedProducts.every((product) => product.verified && product.productUrl && product.advisorFit));
  assert.ok(result.products.every((product: any) => product.advisorFit.matchingStatus !== 'not_matching'));
});

test('no-result search streams an empty product list and keeps old cards out of the current answer', async () => {
  let streamedProducts: any[] | null = null;
  const result = await respondToAdvisorTurn({
    ...advisorRequest,
    searchProducts: async () => ({ items: [], budgetUnknownItems: [], notes: [] }),
    onVerifiedProducts: (products: any[]) => { streamedProducts = products; },
  });
  assert.equal(result.searchPerformed, true);
  assert.deepEqual(result.products, []);
  assert.deepEqual(streamedProducts, []);
  assert.deepEqual(result.currentProductIds, []);
});

test('Ollama timeout falls back to deterministic verified facts while cancellation aborts the answer', async () => {
  const product = advisorProductFixture('64a000000000000000000004', 'Lenovo verified C', 18_000_000);
  const base = {
    ...advisorRequest, intent: 'compatibility_check', latestMessage: 'Can this run Docker?',
    searchProducts: async () => ({ items: [product], budgetUnknownItems: [], notes: [] }),
  };
  const offlineResult = await respondToAdvisorTurn({
    ...base, generateExplanation: async () => { throw new Error('Ollama disconnected'); },
  });
  assert.equal(offlineResult.products.length, 1);
  assert.match(offlineResult.reply, /catalog/);

  const timeoutResult = await respondToAdvisorTurn({
    ...base, generateExplanation: async () => { throw new Error('timeout'); },
  });
  assert.equal(timeoutResult.products.length, 1);
  assert.match(timeoutResult.reply, /catalog/);

  const controller = new AbortController();
  await assert.rejects(respondToAdvisorTurn({
    ...base, signal: controller.signal,
    generateExplanation: async () => { controller.abort(new Error('client cancelled')); throw controller.signal.reason; },
  }), /client cancelled/);
});

const keep = () => ({ operation: 'KEEP', value: null });
function changeSet() {
  return {
    category: keep(), brands: keep(), budgetMin: keep(), budgetMax: keep(), budgetFlexible: keep(),
    purpose: keep(), audience: keep(), environment: keep(), existingHardware: keep(),
    requiredSpecs: { ramGB: keep(), storageGB: keep(), storageType: keep(), vramGB: keep(), displayInches: keep() },
    preferences: keep(), exclusions: keep(), selectionCriteria: keep(), modelIdentifiers: keep(), variant: keep(),
  };
}
function operation(operation: 'KEEP' | 'REPLACE' | 'REMOVE' | 'ADD', value: unknown = null) { return { operation, value }; }
function operationAnalysis(requirements: ReturnType<typeof changeSet>) {
  return { intent: 'product_consultation', inScope: true, requirements } as any;
}

test('replacing ASUS with Lenovo keeps the existing budget and purpose', () => {
  const previous = { ...EMPTY_ADVISOR_REQUIREMENTS, category: 'laptop', brands: ['ASUS'], budgetMax: 20_000_000, purpose: 'programming' };
  const changes = changeSet();
  changes.brands = operation('REPLACE', ['Lenovo']) as any;
  const next = mergeAdvisorRequirements(previous, operationAnalysis(changes), 'Chuyển sang Lenovo.');
  assert.deepEqual(next.brands, ['Lenovo']);
  assert.equal(next.budgetMax, 20_000_000);
  assert.equal(next.purpose, 'programming');
});

test('replacing budget keeps the existing purpose', () => {
  const previous = { ...EMPTY_ADVISOR_REQUIREMENTS, category: 'laptop', purpose: 'programming', budgetMax: 20_000_000 };
  const changes = changeSet();
  changes.budgetMax = operation('REPLACE', 25_000_000) as any;
  const next = mergeAdvisorRequirements(previous, operationAnalysis(changes), 'Tăng ngân sách lên 25 triệu.');
  assert.equal(next.budgetMax, 25_000_000);
  assert.equal(next.purpose, 'programming');
});

test('REMOVE clears an obsolete RAM requirement', () => {
  const previous = { ...EMPTY_ADVISOR_REQUIREMENTS, requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: 32 } };
  const changes = changeSet();
  changes.requiredSpecs.ramGB = operation('REMOVE') as any;
  const next = mergeAdvisorRequirements(previous, operationAnalysis(changes), 'Không cần RAM nữa.');
  assert.equal(next.requiredSpecs.ramGB, null);
});

test('a newly acceptable 16GB RAM value replaces the former 32GB requirement', () => {
  const previous = { ...EMPTY_ADVISOR_REQUIREMENTS, requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: 32 } };
  const changes = changeSet();
  changes.requiredSpecs.ramGB = operation('REPLACE', 16) as any;
  const next = mergeAdvisorRequirements(previous, operationAnalysis(changes), 'Không cần 32GB nữa, 16GB cũng được.');
  assert.equal(next.requiredSpecs.ramGB, 16);
});

test('REMOVE deletes only the named GPU exclusion', () => {
  const previous = { ...EMPTY_ADVISOR_REQUIREMENTS, exclusions: ['GPU', 'OLED'] };
  const changes = changeSet();
  changes.exclusions = operation('REMOVE', ['GPU']) as any;
  const next = mergeAdvisorRequirements(previous, operationAnalysis(changes), 'Không cần loại trừ GPU nữa.');
  assert.deepEqual(next.exclusions, ['OLED']);
});

test('REPLACE updates a concrete model without retaining the old model', () => {
  const previous = { ...EMPTY_ADVISOR_REQUIREMENTS, modelIdentifiers: ['ASUS TUF A15'] };
  const changes = changeSet();
  changes.modelIdentifiers = operation('REPLACE', ['ThinkPad E14']) as any;
  const next = mergeAdvisorRequirements(previous, operationAnalysis(changes), 'Đổi model sang ThinkPad E14.');
  assert.deepEqual(next.modelIdentifiers, ['ThinkPad E14']);
});

test('changing category replaces the previous category', () => {
  const previous = { ...EMPTY_ADVISOR_REQUIREMENTS, category: 'laptop' };
  const changes = changeSet();
  changes.category = operation('REPLACE', 'phone') as any;
  const next = mergeAdvisorRequirements(previous, operationAnalysis(changes), 'Chuyển sang điện thoại.');
  assert.equal(next.category, 'phone');
});

test('ADD appends a new preference without removing existing preferences', () => {
  const previous = { ...EMPTY_ADVISOR_REQUIREMENTS, preferences: ['quiet fan'] };
  const changes = changeSet();
  changes.preferences = operation('ADD', ['lightweight']) as any;
  const next = mergeAdvisorRequirements(previous, operationAnalysis(changes), 'Bổ sung tiêu chí nhẹ.');
  assert.deepEqual(next.preferences, ['quiet fan', 'lightweight']);
});

test('an empty new search result replaces the current result while preserving old references', async () => {
  const { recordCurrentSearch, EMPTY_ADVISOR_SEARCH_STATE, allHistoricalProductReferences } = await import('./advisorConversationState');
  const first = recordCurrentSearch(EMPTY_ADVISOR_SEARCH_STATE, { searchId: 'search-1', query: 'ASUS', createdAt: new Date(), productIds: ['asus-1'] });
  const second = recordCurrentSearch(first, { searchId: 'search-2', query: 'Lenovo, under 20m', createdAt: new Date(), productIds: [] });
  assert.deepEqual(second.currentSearchResults, []);
  assert.equal(second.currentSearchId, 'search-2');
  assert.deepEqual(second.previousSearchResults[0].productIds, ['asus-1']);
  assert.deepEqual(allHistoricalProductReferences(second), ['asus-1']);
});

test('a customer can explicitly ask again about an older search result', () => {
  assert.equal(isExplicitHistoricalReference('Hỏi lại về mẫu trong kết quả cũ.'), true);
  assert.equal(isExplicitHistoricalReference('Tìm máy khác giúp tôi.'), false);
});
