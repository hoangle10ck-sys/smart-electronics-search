import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadAndValidateCatalog } from './catalogValidation';

loadAndValidateCatalog()
  .then(async (products) => {
    const result = {
      checkedAt: new Date().toISOString(),
      mode: 'read-only URL reachability checks; no MongoDB writes',
      checkScope: 'HTTPS response status and image content-type only; this does not independently verify model identity, page contents, or image-license terms.',
      catalogEntries: products.length,
      imageUrlsReachable: products.length,
      productPageUrlsReachable: products.length,
      specificationUrlsReachable: products.length,
      entries: products.map((product) => ({ sourceProductId: product.sourceProductId, brand: product.brand, model: product.model, imageUrl: product.imageUrl, productUrl: product.productUrl, specificationSourceUrl: product.specificationSourceUrl })),
    };
    await writeFile(resolve(__dirname, '../../../CATALOG_URL_VERIFICATION.json'), JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify({ ...result, entries: undefined }, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Catalog URL verification failed');
    process.exitCode = 1;
  });
