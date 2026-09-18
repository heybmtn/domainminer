import { verifyDomains } from "../../../lib/enrich.mjs";
import { fail, getBudgetCap, getCache, getClient, json, readJson } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const result = await verifyDomains(body.domains || [], {
      cache: getCache(env),
      client: getClient(env),
      budgetCapUSD: getBudgetCap(env),
    });
    return json(result);
  } catch (err) {
    return fail(err);
  }
}
