import { judgeBrandabilityBatch } from "../../../lib/jevJudgments.mjs";
import { fail, getCache, getJevBudgetCap, getJevClient, json, readJson } from "../../_lib.js";
import { getSpend } from "../../../lib/spend.mjs";

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const cache = getCache(env);
    const items = await judgeBrandabilityBatch(getJevClient(env), rows, {
      cache,
      budgetCapUSD: getJevBudgetCap(env),
      concurrency: 5,
    });
    const cost = items.reduce((sum, it) => sum + (it.cost || 0), 0);
    const spend = await getSpend({ cache, service: "jev" });
    return json({ items, cost, spendTotal: spend.total });
  } catch (err) {
    return fail(err);
  }
}
