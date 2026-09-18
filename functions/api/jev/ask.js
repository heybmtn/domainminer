import { ask } from "../../../lib/jev.mjs";
import { fail, getCache, getJevBudgetCap, getJevClient, json, readJson } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const result = await ask(getJevClient(env), {
      state: body.state,
      questions: body.questions,
    }, {
      cache: getCache(env),
      force: Boolean(body.force),
      budgetCapUSD: getJevBudgetCap(env),
    });
    return json(result);
  } catch (err) {
    return fail(err);
  }
}
