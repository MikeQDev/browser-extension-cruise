importScripts("config.js", "parse.js");

// Content-script fetches are subject to the cruise line site's CORS context, so lookups go
// through the service worker, which host_permissions lets reach the API.
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

async function lookup(base, params) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== ""),
  );
  const url = `${base}?${query}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  let result;
  try {
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    result = res.ok
      ? { ok: true, data: body }
      : { ok: false, status: res.status, error: body.error?.message || body.message || res.statusText };
  } catch (error) {
    return { ok: false, status: 0, error: "Price history API unreachable" };
  }
  // Only cache answers, not outages, so a restarted API is picked up at once
  if (result.ok || result.status === 404) {
    cache.set(url, { at: Date.now(), result });
  }
  return result;
}

const ENDPOINTS = {
  sailing: `${RADAR_CONFIG.API_BASE}/api/sailing`,
  itinerary: `${RADAR_CONFIG.API_BASE}/api/itinerary`,
  cabinCounts: RADAR_CONFIG.CABIN_COUNTS_URL,
};

async function lookupWithNames(base, params) {
  const metadataUrl = RADAR_CONFIG.METADATA_BASE_URL + RadarParse.metadataFile(params.cruiseLine);
  const [result, metadata] = await Promise.all([lookup(base, params), lookup(metadataUrl, {})]);
  if (!result.ok) return result;
  return { ...result, data: RadarParse.withNames(result.data, metadata.ok ? metadata.data : null) };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const base = ENDPOINTS[message?.type];
  if (!base) return false;
  const params = message.params || {};
  const named = message.type === "sailing" || message.type === "itinerary";
  (named ? lookupWithNames(base, params) : lookup(base, params)).then(sendResponse);
  return true;
});
