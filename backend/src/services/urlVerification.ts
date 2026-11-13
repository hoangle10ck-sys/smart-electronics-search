import { validExternalUrl } from './accesstradeSync';

function normalizePageText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/&(?:trade|#8482|#x2122);/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export async function verifyModelPage(urlValue: string, model: string) {
  let url = validExternalUrl(urlValue);
  if (!url) throw new Error('Model page must be a public HTTPS URL');

  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': 'smart-electronics-search/1.0 (catalog source verification)', Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(15000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 5) throw new Error('Model page has too many or invalid redirects');
      url = validExternalUrl(new URL(location, url).toString());
      if (!url) throw new Error('Model page redirects outside public HTTPS URLs');
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Model page returned HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      await response.body?.cancel();
      throw new Error('Model page did not return HTML');
    }
    const html = await response.text();
    if (html.length > 5_000_000) throw new Error('Model page exceeded the verification size limit');
    const normalizedModel = normalizePageText(model);
    if (!normalizedModel || !normalizePageText(html).includes(normalizedModel)) throw new Error(`Model page does not identify ${model}`);
    return { finalUrl: url, status: response.status, checkedAt: new Date() };
  }
  throw new Error('Model page could not be verified');
}
