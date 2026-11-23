import test from 'node:test';
import assert from 'node:assert/strict';
import { missingRecommendationFields, withRecommendationReadiness } from './catalogReadiness';

const completeProduct = {
  name: 'Product A', brand: 'Brand', model: 'A-1', category: 'laptop',
  description: 'CPU: Example processor; RAM: 16 GB.', specifications: { cpu: 'Example processor', memory: '16 GB' },
  imageUrl: 'https://images.example/a.jpg', imageVerificationStatus: 'verified', imageUsagePermission: 'granted',
  imageSource: 'https://images.example/source/a', imageLicense: 'CC BY 4.0',
  imageLicenseUrl: 'https://creativecommons.org/licenses/by/4.0/', imageAttribution: 'Author / source',
  productUrl: 'https://vendor.example/a', specificationSourceUrl: 'https://vendor.example/a/specs',
  sourceEvidence: ['identity', 'product_page', 'specifications', 'description', 'image', 'image_rights']
    .map((evidenceType) => ({ evidenceType, sourceUrl: 'https://vendor.example/a/specs' })),
};

test('complete product facts pass the public recommendation readiness check', () => {
  assert.deepEqual(missingRecommendationFields(completeProduct), []);
});

test('missing description, specs, image, or product/specification URL makes a product incomplete', () => {
  const variants = [
    [{ ...completeProduct, description: '' }, 'description'],
    [{ ...completeProduct, sourceEvidence: [] }, 'descriptionEvidence'],
    [{ ...completeProduct, specifications: {} }, 'specifications'],
    [{ ...completeProduct, imageUrl: null }, 'image'],
    [{ ...completeProduct, imageUsagePermission: 'not_provided' }, 'image'],
    [{ ...completeProduct, productUrl: 'http://vendor.example/a' }, 'productUrl'],
    [{ ...completeProduct, specificationSourceUrl: '' }, 'specificationSourceUrl'],
  ] as const;
  for (const [product, field] of variants) assert.ok(missingRecommendationFields(product).includes(field));
});

test('local product images are accepted only from the catalog image directory and with verified rights', () => {
  const local = { ...completeProduct, imageUrl: '/catalog-images/product-a.webp' };
  assert.deepEqual(missingRecommendationFields(local), []);
  assert.ok(missingRecommendationFields({ ...local, imageUrl: '/../private/a.webp' }).includes('image'));
});

test('readiness query adds completeness constraints without losing existing Mongo conditions', () => {
  const prior = { $and: [{ category: 'laptop' }] };
  const query = withRecommendationReadiness(prior);
  assert.equal(query.$and[0].category, 'laptop');
  assert.ok(query.$and.some((condition: any) => condition.description?.$regex));
  assert.ok(query.$and.some((condition: any) => condition.imageVerificationStatus === 'verified'));
});
