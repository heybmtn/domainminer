import { json, getCache } from "../_lib.js";

export async function onRequestGet({ env }) {
  const cache = getCache(env);
  return json({
    ok: true,
    configured: Boolean(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD),
    cacheSize: await cache.size(),
  });
}
