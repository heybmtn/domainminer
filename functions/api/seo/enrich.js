import { enrichDomains } from "../../../lib/enrich.mjs";
import { fail, getBudgetCap, getCache, getClient, json, readJson } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const result = await enrichDomains(body.domains || [], {
      force: Boolean(body.force),
      cache: getCache(env),
      client: getClient(env),
      nameScores: body.nameScores && typeof body.nameScores === "object" ? body.nameScores : {},
      budgetCapUSD: getBudgetCap(env),
    });
    return json(result);
  } catch (err) {
    return fail(err);
  }
}
