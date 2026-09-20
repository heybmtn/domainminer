import { createDataForSeoClient } from "../lib/dataforseo.mjs";
import { createKvCache } from "../lib/kv-cache.mjs";
import { parseBudgetCap } from "../lib/spend.mjs";

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function getClient(env) {
  const login = env.DATAFORSEO_LOGIN;
  const password = env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    const err = new Error("Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD as Cloudflare Pages secrets (Settings → Variables and Secrets).");
    err.status = 503;
    throw err;
  }
  return createDataForSeoClient({ login, password });
}

export function getCache(env) {
  return createKvCache(env.SEO_CACHE);
}

/** Optional monthly spend cap in USD, from the DATAFORSEO_MONTHLY_BUDGET Pages variable. null = uncapped. */
export function getBudgetCap(env) {
  return parseBudgetCap(env.DATAFORSEO_MONTHLY_BUDGET);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    const err = new Error("Invalid JSON");
    err.status = 400;
    throw err;
  }
}

export function fail(err) {
  return json({ error: err.message || "Server error" }, err.status || 500);
}
