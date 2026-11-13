type WindowEntry = { startedAt: number; count: number };
const windows = new Map<string, WindowEntry>();

export function takeLiveSearchSlot(ip: string, now = Date.now(), limit = 8, windowMs = 60_000) {
  const key = ip || 'unknown';
  const entry = windows.get(key);
  if (!entry || now - entry.startedAt >= windowMs) {
    windows.set(key, { startedAt: now, count: 1 });
    if (windows.size > 5_000) {
      for (const [candidate, value] of windows) if (now - value.startedAt >= windowMs) windows.delete(candidate);
    }
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

export function clearLiveSearchRateLimitsForTests() {
  windows.clear();
}
