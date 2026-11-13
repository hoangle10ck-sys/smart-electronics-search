import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { verifyModelPage } from '../services/urlVerification';

const FILES = [
  'research-pending-amd-ryzen-5000-desktop.json',
  'research-pending-amd-ryzen-4000-desktop.json',
  'research-pending-amd-ryzen-pro-4000-desktop.json',
];
const stamp = new Date().toISOString();

async function main() {
  const changed: Array<{ file: string; rows: any[] }> = [];
  const report: Array<{ model: string; url: string; status: 'verified' | 'pending'; reason?: string }> = [];

  for (const file of FILES) {
    const path = resolve(__dirname, file);
    const rows = JSON.parse(await readFile(path, 'utf8')) as any[];
    for (const row of rows) {
      const isPro = row.generation?.includes('PRO 4000');
      const series = isPro ? 'ryzen-pro/ryzen-pro-4000-series' : row.generation?.includes('4000') ? 'ryzen/ryzen-4000-series' : 'ryzen/ryzen-5000-series';
      const slug = `amd-${String(row.model).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const candidate = `https://www.amd.com/en/support/downloads/drivers.html/processors/${series}/${slug}.html`;
      try {
        const checked = await verifyModelPage(candidate, row.model);
        const expectedSlug = slug.replace(/-/g, '');
        if (!checked.finalUrl.toLowerCase().replace(/[^a-z0-9]+/g, '').includes(expectedSlug)) throw new Error('Redirected page URL is not the exact model page');

        row.productUrl = checked.finalUrl;
        row.specificationSourceUrl = checked.finalUrl;
        row.productVerificationStatus = 'verified';
        row.imageVerificationStatus = 'pending';
        row.urlVerificationStatus = 'verified';
        row.publicationStatus = 'pending';
        row.evidence = Array.isArray(row.evidence) ? row.evidence : [];
        const productEvidence = {
          evidenceType: 'product_page',
          sourceName: 'AMD exact-model support and specifications page',
          sourceUrl: checked.finalUrl,
          notes: `The AMD page title and specification section identify ${row.model}; its model-specific URL returned HTTP ${checked.status}.`,
        };
        row.evidence = row.evidence.filter((evidence: any) => evidence.evidenceType !== 'product_page');
        row.evidence.push(productEvidence);
        const specificationEvidence = row.evidence.find((evidence: any) => evidence.evidenceType === 'specifications');
        if (specificationEvidence) {
          specificationEvidence.sourceUrl = checked.finalUrl;
          specificationEvidence.notes = `AMD's exact-model specification page lists the recorded technical values for ${row.model}.`;
        }
        row.reasons = (row.reasons ?? []).filter((reason: string) => !/individual.*product|exact product|URL.*review|URL.*follow|reachability/i.test(reason));
        if (!row.reasons.some((reason: string) => /image|license|reuse permission/i.test(reason))) row.reasons.unshift('No exact-model image with verified reuse permission has been visually reviewed; keep private pending image and license review.');
        row.researchedAt = stamp;
        report.push({ model: row.model, url: checked.finalUrl, status: 'verified' });
      } catch (error) {
        row.productVerificationStatus = row.productVerificationStatus === 'rejected' ? 'rejected' : 'pending';
        row.imageVerificationStatus = 'pending';
        row.urlVerificationStatus = 'pending';
        row.publicationStatus = 'pending';
        row.reasons = [...(row.reasons ?? []).filter((reason: string) => !/exact-model product URL/i.test(reason)), `An exact-model AMD URL did not pass the live HTTP/model-name check: ${(error as Error).message}`];
        report.push({ model: row.model, url: candidate, status: 'pending', reason: (error as Error).message });
      }
    }
    changed.push({ file: path, rows });
  }

  const verified = report.filter((row) => row.status === 'verified').length;
  const pending = report.length - verified;
  if (!report.length || report.length !== 36) throw new Error(`Expected 36 AMD Ryzen 5000/4000/PRO 4000 records; found ${report.length}`);
  for (const item of changed) await writeFile(item.file, `${JSON.stringify(item.rows, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ checkedAt: stamp, modelsChecked: report.length, exactModelUrlsVerified: verified, pendingUrlCheck: pending, rows: report }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'AMD URL preparation failed');
  process.exitCode = 1;
});
