import { assertLocalMongoUri } from './techApiCatalog';

export type TechApiMongoDestination = {
  mode: 'local' | 'remote';
  uri: string;
  databaseName: string;
};

const DESTINATION_ENV_KEYS = [
  'TECHAPI_MONGO_DESTINATION_URI',
  'TECHAPI_MONGO_DESTINATION_DATABASE',
  'TECHAPI_MONGO_DESTINATION_ALLOWED_HOSTS',
] as const;

/**
 * Resolve the SoC import's Product/SyncRun destination. Remote destinations are
 * opt-in and only supported when TechAPI source records come from readonly SQLite.
 * The global MONGODB_URI guard remains loopback-only.
 */
export function resolveTechApiMongoDestination(
  environment: NodeJS.ProcessEnv,
  sourceStorage: 'mongo' | 'sqlite',
): TechApiMongoDestination {
  const hasRemoteSetting = DESTINATION_ENV_KEYS.some((key) => Boolean(environment[key]?.trim()));
  if (!hasRemoteSetting) {
    const uri = environment.MONGODB_URI?.trim();
    if (!uri) throw new Error('MONGODB_URI is required for the local SoC import destination.');
    assertLocalMongoUri(uri);
    return { mode: 'local', uri, databaseName: databaseNameFromUri(uri) || 'test' };
  }

  if (sourceStorage !== 'sqlite') {
    throw new Error('A remote Product/SyncRun destination requires TECHAPI_STORAGE=sqlite so source and destination stay separate.');
  }

  const uri = environment.TECHAPI_MONGO_DESTINATION_URI?.trim();
  const expectedDatabase = environment.TECHAPI_MONGO_DESTINATION_DATABASE?.trim();
  const allowedHostsValue = environment.TECHAPI_MONGO_DESTINATION_ALLOWED_HOSTS?.trim();
  if (!uri || !expectedDatabase || !allowedHostsValue) {
    throw new Error('Remote SoC destination requires TECHAPI_MONGO_DESTINATION_URI, TECHAPI_MONGO_DESTINATION_DATABASE, and TECHAPI_MONGO_DESTINATION_ALLOWED_HOSTS.');
  }

  const parsed = parseMongoUri(uri);
  const allowedHosts = parseExactHostAllowlist(allowedHostsValue);
  if (!parsed.hosts.length || parsed.hosts.some((host) => !allowedHosts.has(host))) {
    throw new Error('Remote SoC destination host is not in TECHAPI_MONGO_DESTINATION_ALLOWED_HOSTS.');
  }
  if (parsed.databaseName !== expectedDatabase) {
    throw new Error('Remote SoC destination URI database does not match TECHAPI_MONGO_DESTINATION_DATABASE.');
  }
  if (!parsed.tlsEnabled) {
    throw new Error('Remote SoC destination must require TLS.');
  }
  if (parsed.insecureTls) throw new Error('Remote SoC destination must verify TLS certificates and hostnames.');
  if (!parsed.authenticated) throw new Error('Remote SoC destination must use an authenticated MongoDB identity.');

  return { mode: 'remote', uri, databaseName: expectedDatabase };
}

function parseMongoUri(uri: string): {
  hosts: string[];
  databaseName: string;
  tlsEnabled: boolean;
  insecureTls: boolean;
  authenticated: boolean;
} {
  const scheme = uri.match(/^(mongodb(?:\+srv)?):\/\//i)?.[1]?.toLowerCase();
  if (!scheme) throw new Error('MongoDB destination URI is invalid.');
  const authorityStart = uri.indexOf('//') + 2;
  const relativeAuthorityEnd = uri.slice(authorityStart).search(/[/?#]/g);
  const authorityEnd = relativeAuthorityEnd < 0 ? -1 : authorityStart + relativeAuthorityEnd;
  const authority = uri.slice(authorityStart, authorityEnd < 0 ? uri.length : authorityEnd);
  const hostPart = authority.slice(authority.lastIndexOf('@') + 1);
  if (!hostPart || /\s/.test(hostPart)) throw new Error('MongoDB destination URI is invalid.');

  const hosts = (scheme === 'mongodb+srv' ? [hostPart] : hostPart.split(','))
    .map((entry) => normalizeMongoHost(entry));
  if (hosts.some((host) => !host)) throw new Error('MongoDB destination URI is invalid.');
  if (scheme === 'mongodb+srv' && hostPart.includes(':')) throw new Error('MongoDB SRV destination URI must not specify a port.');

  const pathStart = authorityEnd >= 0 && uri[authorityEnd] === '/' ? authorityEnd + 1 : -1;
  const pathEnd = pathStart < 0 ? -1 : uri.slice(pathStart).search(/[?#]/g);
  const databasePart = pathStart < 0 ? '' : uri.slice(pathStart, pathEnd < 0 ? uri.length : pathStart + pathEnd);
  let databaseName = '';
  try { databaseName = decodeURIComponent(databasePart); } catch { throw new Error('MongoDB destination URI is invalid.'); }
  const queryStart = uri.indexOf('?');
  const query = new URLSearchParams(queryStart < 0 ? '' : uri.slice(queryStart + 1).split('#')[0]);
  const options = new Map([...query.entries()].map(([key, value]) => [key.toLowerCase(), value.toLowerCase()]));
  const tlsValue = options.get('tls') ?? options.get('ssl');
  const tlsEnabled = scheme === 'mongodb+srv'
    ? tlsValue !== 'false'
    : tlsValue === 'true' || tlsValue === '1';
  const insecureTls = ['tlsInsecure', 'tlsAllowInvalidCertificates', 'tlsAllowInvalidHostnames']
    .some((key) => options.get(key.toLowerCase()) === 'true')
    || options.get('sslvalidate') === 'false';
  const atIndex = authority.lastIndexOf('@');
  const userInfo = atIndex >= 0 ? authority.slice(0, atIndex) : '';
  const username = userInfo.includes(':') ? userInfo.slice(0, userInfo.indexOf(':')) : userInfo;
  const authenticated = Boolean(username) || options.get('authmechanism') === 'mongodb-x509';
  return { hosts, databaseName, tlsEnabled, insecureTls, authenticated };
}

function normalizeMongoHost(value: string): string {
  const hostPort = value.trim();
  if (!hostPort) return '';
  try {
    const parsed = new URL(`http://${hostPort}`);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return '';
    return parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  } catch {
    return '';
  }
}

function parseExactHostAllowlist(value: string): Set<string> {
  const entries = value.split(',').map((entry) => entry.trim());
  if (!entries.length || entries.some((entry) => !entry || entry.includes('*'))) {
    throw new Error('TECHAPI_MONGO_DESTINATION_ALLOWED_HOSTS must contain exact hostnames without wildcards.');
  }
  const hosts = entries.map((entry) => {
    const host = normalizeMongoHost(entry);
    if (!host || /:\d+$/.test(entry)) return '';
    return host;
  });
  if (hosts.some((host) => !host)) throw new Error('TECHAPI_MONGO_DESTINATION_ALLOWED_HOSTS contains an invalid hostname.');
  return new Set(hosts);
}

function databaseNameFromUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    return decodeURIComponent(parsed.pathname.replace(/^\//, '').split('/')[0] ?? '');
  } catch {
    return '';
  }
}
