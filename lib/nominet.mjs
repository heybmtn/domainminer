const DROPLIST_URL = "https://droplists.nominet.uk/current/uk.csv.gz";
const CACHE_KEY = "nominet-droplist";
/** Nominet publishes this once a day; this just avoids re-fetching it on every page load. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function gunzipText(response) {
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/**
 * Fetches and decompresses today's Nominet .uk droplist, going through the
 * same key-value cache used for SEO metrics (getMany/setMany) so this works
 * unchanged against both the local file cache and Cloudflare KV. Uses
 * getMany, not get — the Cloudflare KV cache only implements getMany/setMany/size.
 */
export async function fetchDroplist({ cache, force = false, fetchImpl = fetch, now = Date.now } = {}) {
  if (cache && !force) {
    const found = await cache.getMany([CACHE_KEY]);
    const cached = found[CACHE_KEY];
    if (cached && now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { csv: cached.csv, fetchedAt: cached.fetchedAt, cached: true };
    }
  }
  const res = await fetchImpl(DROPLIST_URL);
  if (!res.ok) {
    const err = new Error(`Nominet droplist fetch failed: HTTP ${res.status}`);
    err.status = 502;
    throw err;
  }
  const csv = await gunzipText(res);
  const fetchedAt = now();
  if (cache) await cache.setMany({ [CACHE_KEY]: { fetchedAt, csv } });
  return { csv, fetchedAt, cached: false };
}

export { DROPLIST_URL, CACHE_KEY, CACHE_TTL_MS };
