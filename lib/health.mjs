import { createDataForSeoClient, readCredentials } from "./dataforseo.mjs";

export async function healthPayload(env, cache) {
  const creds = readCredentials(env);
  const payload = {
    ok: true,
    configured: creds.configured,
    authorized: false,
    cacheSize: cache ? await cache.size() : 0,
  };
  if (!creds.configured) return payload;
  try {
    await createDataForSeoClient(creds).ping();
    payload.authorized = true;
  } catch (err) {
    payload.authError = err.message || "DataForSEO authorization failed";
  }
  return payload;
}
