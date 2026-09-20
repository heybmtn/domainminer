import { json, getBudgetCap, getCache } from "../_lib.js";
import { getSpend } from "../../lib/spend.mjs";

export async function onRequestGet({ env }) {
  const cache = getCache(env);
  const spend = await getSpend({ cache });
  return json({
    ok: true,
    configured: Boolean(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD),
    cacheSize: await cache.size(),
    spend: { ...spend, capUSD: getBudgetCap(env) },
  });
}
