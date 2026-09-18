import { json, getBudgetCap, getCache, getJevBudgetCap, jevConfigured } from "../_lib.js";
import { getSpend } from "../../lib/spend.mjs";

export async function onRequestGet({ env }) {
  const cache = getCache(env);
  const dataforseoSpend = await getSpend({ cache, service: "dataforseo" });
  const jevSpend = await getSpend({ cache, service: "jev" });
  return json({
    ok: true,
    configured: Boolean(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD),
    cacheSize: await cache.size(),
    spend: { ...dataforseoSpend, capUSD: getBudgetCap(env) },
    jev: {
      configured: jevConfigured(env),
      spend: { ...jevSpend, capUSD: getJevBudgetCap(env) },
    },
  });
}
