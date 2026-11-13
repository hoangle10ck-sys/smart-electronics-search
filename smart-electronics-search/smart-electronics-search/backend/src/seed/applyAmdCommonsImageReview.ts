import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FILES = [
  'research-pending-amd-ryzen-5000-desktop.json',
  'research-pending-amd-ryzen-4000-desktop.json',
  'research-pending-amd-ryzen-pro-4000-desktop.json',
  'research-pending-amd-ryzen-7000-desktop.json',
  'research-pending-amd-ryzen-9000-desktop.json',
];
const reviewedImages = [
  {
    sourceKey: 'web-research:amd:ryzen-9-5900x',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/81/AMD_Ryzen_9_5900X_by_BugWarp_01.jpg',
    filePageUrl: 'https://commons.wikimedia.org/wiki/File:AMD_Ryzen_9_5900X_by_BugWarp_01.jpg',
    license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', author: 'BugWarp',
  },
  {
    sourceKey: 'web-research:amd:ryzen-7-5800x3d',
    imageUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2b/AMD_Ryzen_7_5800X3D.jpg/960px-AMD_Ryzen_7_5800X3D.jpg',
    filePageUrl: 'https://commons.wikimedia.org/wiki/File:AMD_Ryzen_7_5800X3D.jpg',
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', author: 'Phiarc',
  },
  {
    sourceKey: 'web-research:amd:ryzen-7-5800x',
    imageUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c7/AMD_Ryzen_7_5800X_19339.jpg/960px-AMD_Ryzen_7_5800X_19339.jpg',
    filePageUrl: 'https://commons.wikimedia.org/wiki/File:AMD_Ryzen_7_5800X_19339.jpg',
    license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', author: 'Michael Wolf (la-wolf.de), Penig',
  },
  {
    sourceKey: 'web-research:amd:ryzen-7-5700x',
    imageUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a7/AMD_Ryzen_7_5700X_1.jpg/960px-AMD_Ryzen_7_5700X_1.jpg',
    filePageUrl: 'https://commons.wikimedia.org/wiki/File:AMD_Ryzen_7_5700X_1.jpg',
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', author: 'Qurren',
  },
  {
    sourceKey: 'web-research:amd:ryzen-5-5600g',
    imageUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6f/AMD%407nm%40Zen3%40Cezanne%40Ryzen_5_5600G%40100-000000252_EF_2127SUS_9JP9827S10002_DSC02209-DSC02243.jpg/960px-AMD%407nm%40Zen3%40Cezanne%40Ryzen_5_5600G%40100-000000252_EF_2127SUS_9JP9827S10002_DSC02209-DSC02243.jpg',
    filePageUrl: 'https://commons.wikimedia.org/wiki/File:AMD%407nm%40Zen3%40Cezanne%40Ryzen_5_5600G%40100-000000252_EF_2127SUS_9JP9827S10002_DSC02209-DSC02243.jpg',
    license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', author: 'FritzchensFritz',
  },
  {
    sourceKey: 'web-research:amd:ryzen-7-7800x3d',
    imageUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bc/Ryzen_7_7800_X3D%2C_unlocked.jpg/960px-Ryzen_7_7800_X3D%2C_unlocked.jpg',
    filePageUrl: 'https://commons.wikimedia.org/wiki/File:Ryzen_7_7800_X3D,_unlocked.jpg',
    license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', author: 'Thomas Vogt',
  },
  {
    sourceKey: 'web-research:amd:ryzen-9-9950x',
    imageUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/25/AMD_Ryzen_9_9950X.jpg/960px-AMD_Ryzen_9_9950X.jpg',
    filePageUrl: 'https://commons.wikimedia.org/wiki/File:AMD_Ryzen_9_9950X.jpg',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', author: '4300streetcar',
  },
  {
    sourceKey: 'web-research:amd:ryzen-5-7600',
    imageUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3d/AMD_Ryzen_5_7600_top_IMGP6773_smial_wp.jpg/960px-AMD_Ryzen_5_7600_top_IMGP6773_smial_wp.jpg',
    filePageUrl: 'https://commons.wikimedia.org/wiki/File:AMD_Ryzen_5_7600_top_IMGP6773_smial_wp.jpg',
    license: 'Free Art License', licenseUrl: 'https://artlibre.org/licence/lal/en/', author: 'Rainer Knäpper (Smial)',
  },
  {
    sourceKey: 'web-research:amd:ryzen-9-7900x',
    imageUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a3/AMD_Ryzen_9_7900X.jpg/960px-AMD_Ryzen_9_7900X.jpg',
    filePageUrl: 'https://commons.wikimedia.org/wiki/File:AMD_Ryzen_9_7900X.jpg',
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', author: 'CristoCalis',
  },
  {
    sourceKey: 'web-research:amd:ryzen-9-5950x',
    imageUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/06/Ausf%C3%BChrlicher_Test_der_Ryzen_7000-Serie_%28%E6%9E%81%E5%AE%A2%E6%B9%BEGeekerwan%29_27.png/960px-Ausf%C3%BChrlicher_Test_der_Ryzen_7000-Serie_%28%E6%9E%81%E5%AE%A2%E6%B9%BEGeekerwan%29_27.png',
    filePageUrl: 'https://commons.wikimedia.org/wiki/File:Ausführlicher_Test_der_Ryzen_7000-Serie_(极客湾Geekerwan)_27.png',
    license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', author: '极客湾Geekerwan',
  },
];

async function main() {
  const bySourceKey = new Map(reviewedImages.map((item) => [item.sourceKey, item]));
  let matched = 0;
  for (const file of FILES) {
    const path = resolve(__dirname, file);
    const rows = JSON.parse(await readFile(path, 'utf8')) as any[];
    for (const row of rows) {
      const reviewed = bySourceKey.get(row.sourceKey);
      if (!reviewed) continue;
      if (row.model.toLowerCase().replace(/[^a-z0-9]+/g, '') !== reviewed.sourceKey.split(':').at(-1)?.replace(/[^a-z0-9]+/g, '')) throw new Error(`Research key/model mismatch: ${row.sourceKey}`);
      const attribution = reviewed.license.startsWith('CC0')
        ? `${reviewed.author}, CC0 1.0, via Wikimedia Commons.`
        : `${reviewed.author}, ${reviewed.license}, via Wikimedia Commons; unmodified.`;
      const visualReviewNotes = `Visually inspected the exact-model photograph; the processor lid marking reads ${row.model}.`;
      row.imageCandidate = { ...reviewed, attribution, visualIdentityChecked: true, visualReviewNotes };
      row.imageVerificationStatus = 'verified';
      row.publicationStatus = 'pending';
      row.evidence = (row.evidence ?? []).filter((evidence: any) => evidence.evidenceType !== 'image' && evidence.evidenceType !== 'image_rights');
      row.evidence.push({ evidenceType: 'image', sourceName: 'Wikimedia Commons exact-model photograph', sourceUrl: reviewed.filePageUrl, notes: visualReviewNotes });
      row.evidence.push({ evidenceType: 'image_rights', sourceName: 'Wikimedia Commons file license record', sourceUrl: reviewed.filePageUrl, notes: `${reviewed.license}; ${attribution} License terms and author were checked on this exact file page.` });
      row.reasons = (row.reasons ?? []).filter((reason: string) => !/no exact-model image|image.*permission.*not|license.*review|exact-model image and .*license verified/i.test(reason));
      row.reasons.unshift(`Exact-model image and ${reviewed.license} license verified; the CPU lid marking was visually checked. Keep private until its Product upsert completes.`);
      matched += 1;
      bySourceKey.delete(row.sourceKey);
    }
    await writeFile(path, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  }
  if (bySourceKey.size) throw new Error(`Reviewed image seed keys were not found: ${[...bySourceKey.keys()].join(', ')}`);
  console.log(JSON.stringify({ reviewedImagesApplied: matched, models: reviewedImages.map(({ sourceKey }) => sourceKey) }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Applying Commons image review failed');
  process.exitCode = 1;
});
