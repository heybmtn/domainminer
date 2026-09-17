import { json, getCache } from "../_lib.js";

export async function onRequestGet({ env }) {
  const cache = getCache(env);
  return json({
    ok: true,
    configured: Boolean(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD),
    cacheSize: await cache.size(),
    debug: {
      loginPresent: "DATAFORSEO_LOGIN" in env,
      loginType: typeof env.DATAFORSEO_LOGIN,
      loginLength: (env.DATAFORSEO_LOGIN || "").length,
      passwordPresent: "DATAFORSEO_PASSWORD" in env,
      passwordType: typeof env.DATAFORSEO_PASSWORD,
      passwordLength: (env.DATAFORSEO_PASSWORD || "").length,
      envKeys: Object.keys(env),
    },
  });
}
