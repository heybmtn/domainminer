import { findExpiring } from "../../../lib/enrich.mjs";
import { fail, getBudgetCap, getCache, getClient, json, readJson } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const result = await findExpiring({
      days: body.days,
      registered: body.registered,
      tld: body.tld,
      minRefDomains: body.minRefDomains,
      minOrganic: body.minOrganic,
      limit: body.limit,
    }, { client: getClient(env), cache: getCache(env), budgetCapUSD: getBudgetCap(env) });
    return json(result);
  } catch (err) {
    return fail(err);
  }
}
