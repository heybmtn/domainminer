import { checkBudget, getSpend, recordSpend } from "./spend.mjs";

const API_URL = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_MODEL = "jev-latest";
const SERVICE = "jev";

/** User-supplied pricing (not independently confirmed against TypeSafe's own docs): $42/billion input tokens, output free. */
export const JEV_INPUT_COST_PER_BILLION = 42;

export function estimateCost(usage = {}) {
  const inputTokens = Number(usage.input_tokens) || 0;
  return (inputTokens / 1e9) * JEV_INPUT_COST_PER_BILLION;
}

export function createJevClient({
  apiKey,
  model = DEFAULT_MODEL,
  fetchImpl = fetch,
  baseUrl = API_URL,
} = {}) {
  if (!apiKey) {
    throw new Error("JEV_API_KEY is required");
  }

  async function post(body) {
    const res = await fetchImpl(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, ...body }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json?.error?.message || json?.message || `TypeSafe HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  }

  return { post, apiKey, model };
}

/** Blocks a new paid Jev call once this month's running spend has already reached the cap. */
async function assertBudget({ cache, budgetCapUSD }) {
  if (!cache || budgetCapUSD == null) return;
  const spend = await getSpend({ cache, service: SERVICE });
  const budget = checkBudget({ total: spend.total, capUSD: budgetCapUSD });
  if (budget.exceeded) {
    const err = new Error(
      `Monthly Jev spend cap reached ($${spend.total.toFixed(2)} of $${budgetCapUSD.toFixed(2)} for ${spend.month}). Raise JEV_MONTHLY_BUDGET to continue this month.`,
    );
    err.status = 402;
    throw err;
  }
}

/** Stable cache key for a judgment: same (model, state, questions) always gets the same answer. */
async function cacheKeyFor(model, state, questions) {
  const payload = JSON.stringify({ model, state, questions });
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `jev-${hex}`;
}

/**
 * Low-level call: one state, one or more questions, in a single request (Jev
 * supports multiple questions per state — combine judgments needed at the
 * same pipeline stage instead of paying for separate calls).
 */
export async function ask(client, { state, questions }, { cache, force = false, budgetCapUSD = null } = {}) {
  if (!client) {
    const err = new Error("Jev client is not configured");
    err.status = 503;
    throw err;
  }
  const key = cache ? await cacheKeyFor(client.model, state, questions) : null;
  if (cache && !force) {
    const found = await cache.getMany([key]);
    if (found[key]) return { ...found[key], cached: true };
  }

  await assertBudget({ cache, budgetCapUSD });

  const json = await client.post({ state, questions });
  const usage = json.usage || { input_tokens: 0, output_tokens: 0 };
  const cost = estimateCost(usage);
  const result = { answers: json.answers || {}, usage, cost };

  if (cache) {
    await cache.setMany({ [key]: result });
    await recordSpend({ cache, service: SERVICE, amount: cost });
  }
  return { ...result, cached: false };
}

/** Type (a): pick one option from a list. criteria: { optionKey: "description", ... } */
export async function pickOne(client, { state, instructions, criteria }, opts = {}) {
  const out = await ask(client, {
    state,
    questions: { result: { type: "choice", instructions, criteria } },
  }, opts);
  const a = out.answers.result || {};
  return {
    choice: a.choice ?? null,
    probabilities: a.probabilities || {},
    confidence: a.confidence ?? null,
    usage: out.usage,
    cost: out.cost,
    cached: out.cached,
  };
}

/** Type (b): score context against ordered levels. criteria: ["level 0 description", "level 1 description", ...] */
export async function scoreLevels(client, { state, instructions, criteria }, opts = {}) {
  const out = await ask(client, {
    state,
    questions: { result: { type: "score", instructions, criteria } },
  }, opts);
  const a = out.answers.result || {};
  return {
    score: a.score ?? null,
    legend: a.legend || {},
    confidence: a.confidence ?? null,
    usage: out.usage,
    cost: out.cost,
    cached: out.cached,
  };
}

/** Type (c): probability that a statement is true. */
export async function probability(client, { state, instructions }, opts = {}) {
  const out = await ask(client, {
    state,
    questions: { result: { type: "noul", instructions } },
  }, opts);
  const a = out.answers.result || {};
  return {
    probability: a.noul ?? null,
    usage: out.usage,
    cost: out.cost,
    cached: out.cached,
  };
}

/**
 * Runs ask() over many {state, questions} items with bounded concurrency.
 * Jev has no bulk/array-of-states endpoint (per its docs), so "batching" here
 * means dispatching many individual calls concurrently, not one big payload.
 */
export async function batchAsk(client, items, { cache, force = false, budgetCapUSD = null, concurrency = 8 } = {}) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await ask(client, items[i], { cache, force, budgetCapUSD });
      } catch (err) {
        results[i] = { error: err.message, status: err.status || 500 };
        if (err.status === 402) {
          // Budget cap reached mid-batch: stop starting new calls, but let
          // in-flight workers finish so results stay complete for what ran.
          cursor = items.length;
        }
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
