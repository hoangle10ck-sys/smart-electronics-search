import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVerifiedAdvisorProductContext,
  advisorOfferForVariant,
  classifyAdvisorPrice,
  evaluateVerifiedAdvisorFit,
  validateGeneratedAdvisorAnswer,
} from './advisorProductVerification';
import { EMPTY_ADVISOR_SEARCH_STATE, allHistoricalProductReferences, recordCurrentSearch } from './advisorConversationState';
import { EMPTY_ADVISOR_REQUIREMENTS } from './productAdvisor';

const NOW = new Date('2026-11-12T12:00:00.000Z');
const currentOffer = (overrides: Record<string, unknown> = {}) => ({
  sellerName: 'Example Merchant', price: 18_000_000, currency: 'VND', productUrl: 'https://shop.example/products/laptop',
  verified: true, priceVerificationStatus: 'verified', sourceRetrievedAt: new Date('2026-11-10T12:00:00.000Z'),
  ...overrides,
});
const verifiedProduct = (overrides: Record<string, unknown> = {}) => ({
  _id: 'verified-product-001', name: 'Lenovo ThinkPad Example', brand: 'Lenovo', model: 'ThinkPad Example',
  category: 'laptop', verified: true, productVerificationStatus: 'verified', urlVerificationStatus: 'verified',
  publicationStatus: 'published', productUrl: 'https://manufacturer.example/thinkpad-example',
  specificationSourceUrl: 'https://manufacturer.example/thinkpad-example/specifications',
  sourceEvidence: [{ evidenceType: 'specification', sourceUrl: 'https://manufacturer.example/thinkpad-example/specifications' }],
  specifications: { RAM: '32 GB', CPU: 'Example CPU' }, normalizedSpecs: { ramGB: 32 },
  specs: {}, tags: ['programming'], bestOffer: currentOffer(),
  ...overrides,
});
const requirements = {
  ...EMPTY_ADVISOR_REQUIREMENTS,
  category: 'laptop', brands: ['Lenovo'], budgetMax: 20_000_000,
  purpose: 'programming', requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: 32 },
};

test('verified specifications and fresh sourced price produce PASS criteria', () => {
  const fit = evaluateVerifiedAdvisorFit(verifiedProduct(), requirements, NOW);
  assert.equal(fit.criteria.find((item) => item.key === 'spec_ramGB')?.status, 'PASS');
  assert.equal(fit.criteria.find((item) => item.key === 'budget')?.status, 'PASS');
  assert.equal(fit.matchingStatus, 'fully_matching');
  assert.equal(fit.matchScore, 100);
  assert.ok(fit.dataConfidence > 0);
});

test('missing RAM stays UNKNOWN and prevents fully matching', () => {
  const product = verifiedProduct({ normalizedSpecs: {}, specifications: {} });
  const fit = evaluateVerifiedAdvisorFit(product, requirements, NOW);
  assert.equal(fit.criteria.find((item) => item.key === 'spec_ramGB')?.status, 'UNKNOWN');
  assert.deepEqual(fit.missingSpecifications, ['ramGB']);
  assert.equal(fit.matchingStatus, 'incomplete');
  assert.equal(fit.fullyMatching, false);
});

test('old verified offer is historical and never becomes current price', () => {
  const evidence = classifyAdvisorPrice(currentOffer({ sourceRetrievedAt: new Date('2026-10-01T12:00:00.000Z') }), NOW);
  assert.equal(evidence.status, 'historical');
  assert.equal(evidence.currentPrice, null);
  const fit = evaluateVerifiedAdvisorFit(verifiedProduct({ bestOffer: currentOffer({ sourceRetrievedAt: new Date('2026-10-01T12:00:00.000Z') }) }), requirements, NOW);
  assert.equal(fit.budgetStatus, 'price_unknown');
  assert.equal(fit.criteria.find((item) => item.key === 'budget')?.status, 'UNKNOWN');
});

test('missing price is UNKNOWN', () => {
  assert.equal(classifyAdvisorPrice(null, NOW).status, 'unknown');
  const fit = evaluateVerifiedAdvisorFit(verifiedProduct({ bestOffer: null }), requirements, NOW);
  assert.equal(fit.criteria.find((item) => item.key === 'budget')?.status, 'UNKNOWN');
});

test('an invalid offer URL cannot verify its price', () => {
  const evidence = classifyAdvisorPrice(currentOffer({ productUrl: 'javascript:alert(1)' }), NOW);
  assert.equal(evidence.status, 'reference');
  assert.equal(evidence.currentPrice, null);
});

test('pending and rejected prices are separated from reference and expired prices', () => {
  assert.equal(classifyAdvisorPrice(currentOffer({ priceVerificationStatus: 'pending' }), NOW).status, 'reference');
  assert.equal(classifyAdvisorPrice(currentOffer({ priceVerificationStatus: 'rejected' }), NOW).status, 'expired');
});

test('price is kept attached to the requested product variant', () => {
  const base = new Date('2026-11-10T12:00:00.000Z');
  const offer512 = currentOffer({ variantLabel: '16GB RAM / 512GB SSD', price: 17_000_000, sourceRetrievedAt: base });
  const offer1TB = currentOffer({ variantLabel: '16GB RAM / 1TB SSD', price: 19_000_000, sourceRetrievedAt: base });
  assert.equal(advisorOfferForVariant([offer512, offer1TB], ['1TB'], NOW)?.price, 19_000_000);
  assert.equal(advisorOfferForVariant([offer512], ['1TB'], NOW), null);
});

test('a current price above the budget fails and is not fully matching', () => {
  const fit = evaluateVerifiedAdvisorFit(verifiedProduct({ bestOffer: currentOffer({ price: 25_000_000 }) }), requirements, NOW);
  assert.equal(fit.budgetStatus, 'over_budget');
  assert.equal(fit.criteria.find((item) => item.key === 'budget')?.status, 'FAIL');
  assert.equal(fit.matchingStatus, 'not_matching');
});

test('a known required specification below the minimum is FAIL, not UNKNOWN', () => {
  const fit = evaluateVerifiedAdvisorFit(verifiedProduct({ normalizedSpecs: { ramGB: 16 } }), requirements, NOW);
  assert.equal(fit.criteria.find((item) => item.key === 'spec_ramGB')?.status, 'FAIL');
  assert.equal(fit.matchingStatus, 'not_matching');
});

test('data confidence falls when verified evidence provenance is absent', () => {
  const complete = evaluateVerifiedAdvisorFit(verifiedProduct(), requirements, NOW);
  const sparse = evaluateVerifiedAdvisorFit(verifiedProduct({ sourceEvidence: [], productUrl: null, specificationSourceUrl: null }), requirements, NOW);
  assert.ok(sparse.dataConfidence < complete.dataConfidence);
});

test('verified context includes source-linked specs and current price metadata', () => {
  const product = verifiedProduct({ imageUrl: 'https://cdn.example/thinkpad.jpg', imageVerificationStatus: 'verified', imageUsagePermission: 'granted' });
  const context = buildVerifiedAdvisorProductContext({ ...product, advisorFit: evaluateVerifiedAdvisorFit(product, requirements, NOW) });
  assert.equal(context.productId, 'verified-product-001');
  assert.equal(context.canonicalName, 'Lenovo ThinkPad Example');
  assert.equal(context.specifications.RAM.value, '32 GB');
  assert.deepEqual(context.specificationSources, ['https://manufacturer.example/thinkpad-example/specifications']);
  assert.equal(context.price.status, 'current_verified');
  assert.equal(context.price.currency, 'VND');
  assert.equal(context.price.merchant, 'Example Merchant');
  assert.equal(context.price.productUrl, 'https://shop.example/products/laptop');
  assert.equal(context.imageUrl, 'https://cdn.example/thinkpad.jpg');
});

test('generated answer rejects a number not present in verified facts or requirements', () => {
  const context = buildVerifiedAdvisorProductContext({ ...verifiedProduct(), advisorFit: evaluateVerifiedAdvisorFit(verifiedProduct(), requirements, NOW) });
  assert.equal(validateGeneratedAdvisorAnswer({
    reply: 'Mẫu này có RAM 64GB.', productIds: [context.productId], suggestedQuestions: [], needsClarification: false,
  }, [context], requirements, 'Tôi cần laptop'), false);
});

test('generated answer rejects a RAM claim that only matches the request, not the product', () => {
  const product = verifiedProduct({ specifications: { RAM: '16 GB' }, normalizedSpecs: { ramGB: 16 } });
  const context = buildVerifiedAdvisorProductContext({ ...product, advisorFit: evaluateVerifiedAdvisorFit(product, requirements, NOW) });
  assert.equal(validateGeneratedAdvisorAnswer({
    reply: 'RAM tối thiểu 32GB đã đáp ứng.', productIds: [context.productId], suggestedQuestions: [], needsClarification: false,
  }, [context], requirements, 'Tôi cần RAM 32GB'), false);
});

test('generated answer rejects a URL that the backend did not provide', () => {
  const context = buildVerifiedAdvisorProductContext({ ...verifiedProduct(), advisorFit: evaluateVerifiedAdvisorFit(verifiedProduct(), requirements, NOW) });
  assert.equal(validateGeneratedAdvisorAnswer({
    reply: 'Xem thêm tại https://fake.example/product', productIds: [context.productId], suggestedQuestions: [], needsClarification: false,
  }, [context], requirements, 'Tôi cần laptop'), false);
});

test('generated answer rejects unsupported compatibility claims', () => {
  const product = verifiedProduct({ specifications: { RAM: '32 GB' }, normalizedSpecs: { ramGB: 32 } });
  const context = buildVerifiedAdvisorProductContext({ ...product, advisorFit: evaluateVerifiedAdvisorFit(product, requirements, NOW) });
  assert.equal(validateGeneratedAdvisorAnswer({
    reply: 'Máy này chạy Docker tốt.', productIds: [context.productId], suggestedQuestions: [], needsClarification: false,
  }, [context], requirements, 'Tôi dùng Docker'), false);
});

test('generated answer rejects a product ID outside the backend candidate set', () => {
  const context = buildVerifiedAdvisorProductContext({ ...verifiedProduct(), advisorFit: evaluateVerifiedAdvisorFit(verifiedProduct(), requirements, NOW) });
  assert.equal(validateGeneratedAdvisorAnswer({
    reply: 'Mình đã lọc một số lựa chọn.', productIds: ['invented-product'], suggestedQuestions: [], needsClarification: false,
  }, [context], requirements, 'Tôi cần laptop'), false);
});

test('an empty new result set remains current-empty while the old result stays historical', () => {
  const first = recordCurrentSearch(EMPTY_ADVISOR_SEARCH_STATE, {
    searchId: 'old-search', query: 'Lenovo laptop', createdAt: NOW, productIds: ['old-product'],
  });
  const second = recordCurrentSearch(first, {
    searchId: 'new-search', query: 'new requirements', createdAt: NOW, productIds: [],
  });
  assert.deepEqual(second.currentSearchResults, []);
  assert.equal(second.currentSearchId, 'new-search');
  assert.ok(allHistoricalProductReferences(second).includes('old-product'));
});
