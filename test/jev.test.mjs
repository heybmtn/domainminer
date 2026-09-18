import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ask,
  batchAsk,
  createJevClient,
  estimateCost,
  JEV_INPUT_COST_PER_BILLION,
  pickOne,
  probability,
  scoreLevels,
} from "../lib/jev.mjs";
import { createKvCache } from "../lib/kv-cache.mjs";
import { getSpend } from "../lib/spend.mjs";

function fakeKvNamespace() {
  const store = new Map();
  return {
    async get(key) { return store.get(key) || null; },
    async put(key, value) { store.set(key, value); },
    async list({ prefix = "" } = {}) {
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
      return { keys, list_complete: true, cursor: undefined };
    },
  };
}

function fakeFetch(handler) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    const result = await handler(url, init, body);
    return {
      ok: true,
      status: 200,
      json: async () => result,
    };
  };
}

test("createJevClient requires an API key", () => {
  assert.throws(() => createJevClient({ apiKey: "" }), /JEV_API_KEY/);
});

test("createJevClient sends Bearer auth, model, and JSON body", async () => {
  let seenUrl, seenHeaders, seenBody;
  const fetchImpl = async (url, init) => {
    seenUrl = url;
    seenHeaders = init.headers;
    seenBody = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ answers: {}, usage: { input_tokens: 0, output_tokens: 0 } }) };
  };
  const client = createJevClient({ apiKey: "secret-key", fetchImpl });
  await client.post({ state: "hello", questions: {} });
  assert.equal(seenUrl, "https://api.typesafe.ai/v1/systemone");
  assert.equal(seenHeaders.Authorization, "Bearer secret-key");
  assert.equal(seenHeaders["Content-Type"], "application/json");
  assert.equal(seenBody.model, "jev-latest");
  assert.equal(seenBody.state, "hello");
});

test("createJevClient throws with the response error message on a non-OK status", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: { message: "Invalid API key" } }),
  });
  const client = createJevClient({ apiKey: "bad-key", fetchImpl });
  await assert.rejects(
    () => client.post({ state: "x", questions: {} }),
    (err) => { assert.equal(err.status, 401); assert.match(err.message, /Invalid API key/); return true; },
  );
});

test("estimateCost uses input tokens only, at the given rate, output free", () => {
  assert.equal(estimateCost({ input_tokens: 1e9, output_tokens: 1e9 }), JEV_INPUT_COST_PER_BILLION);
  assert.equal(estimateCost({ input_tokens: 0, output_tokens: 999 }), 0);
  assert.equal(estimateCost(), 0);
});

test("pickOne sends a choice question and unpacks choice/probabilities/confidence", async () => {
  let seenQuestions;
  const fetchImpl = fakeFetch(async (url, init, body) => {
    seenQuestions = body.questions;
    return {
      answers: {
        result: { type: "choice", choice: "billing", probabilities: { billing: 0.84, technical: 0.16 }, confidence: 0.6 },
      },
      usage: { input_tokens: 300, output_tokens: 40 },
    };
  });
  const client = createJevClient({ apiKey: "k", fetchImpl });
  const out = await pickOne(client, {
    state: "ticket text",
    instructions: "Which team should handle this",
    criteria: { billing: "Payment issues", technical: "Bugs" },
  });
  assert.equal(seenQuestions.result.type, "choice");
  assert.equal(out.choice, "billing");
  assert.equal(out.probabilities.billing, 0.84);
  assert.equal(out.confidence, 0.6);
  assert.ok(out.cost > 0);
});

test("scoreLevels sends a score question and unpacks score/legend/confidence", async () => {
  const fetchImpl = fakeFetch(async () => ({
    answers: { result: { type: "score", score: 1.035, legend: { 0: "Calm", 1: "Civil", 2: "Angry" }, confidence: 0.84 } },
    usage: { input_tokens: 100, output_tokens: 10 },
  }));
  const client = createJevClient({ apiKey: "k", fetchImpl });
  const out = await scoreLevels(client, {
    state: "ticket text",
    instructions: "How frustrated is the customer",
    criteria: ["Calm", "Civil", "Angry"],
  });
  assert.equal(out.score, 1.035);
  assert.equal(out.legend["1"], "Civil");
  assert.equal(out.confidence, 0.84);
});

test("probability sends a noul question and unpacks a bare probability", async () => {
  const fetchImpl = fakeFetch(async (url, init, body) => {
    assert.equal(body.questions.result.type, "noul");
    return { answers: { result: { type: "noul", noul: 0.999 } }, usage: { input_tokens: 50, output_tokens: 5 } };
  });
  const client = createJevClient({ apiKey: "k", fetchImpl });
  const out = await probability(client, { state: "ticket text", instructions: "This message is urgent" });
  assert.equal(out.probability, 0.999);
});

test("ask caches judgments and does not refetch on a repeat call", async () => {
  let calls = 0;
  const fetchImpl = fakeFetch(async () => {
    calls++;
    return { answers: { result: { type: "noul", noul: 0.5 } }, usage: { input_tokens: 10, output_tokens: 1 } };
  });
  const client = createJevClient({ apiKey: "k", fetchImpl });
  const cache = createKvCache(fakeKvNamespace());
  const q = { state: "same state", questions: { result: { type: "noul", instructions: "x" } } };
  const first = await ask(client, q, { cache });
  const second = await ask(client, q, { cache });
  assert.equal(calls, 1);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.deepEqual(second.answers, first.answers);
});

test("ask force:true bypasses the cache", async () => {
  let calls = 0;
  const fetchImpl = fakeFetch(async () => {
    calls++;
    return { answers: { result: { type: "noul", noul: 0.5 } }, usage: { input_tokens: 10, output_tokens: 1 } };
  });
  const client = createJevClient({ apiKey: "k", fetchImpl });
  const cache = createKvCache(fakeKvNamespace());
  const q = { state: "same state", questions: { result: { type: "noul", instructions: "x" } } };
  await ask(client, q, { cache });
  await ask(client, q, { cache, force: true });
  assert.equal(calls, 2);
});

test("a different state produces a different cache entry", async () => {
  let calls = 0;
  const fetchImpl = fakeFetch(async () => {
    calls++;
    return { answers: { result: { type: "noul", noul: 0.5 } }, usage: { input_tokens: 10, output_tokens: 1 } };
  });
  const client = createJevClient({ apiKey: "k", fetchImpl });
  const cache = createKvCache(fakeKvNamespace());
  const questions = { result: { type: "noul", instructions: "x" } };
  await ask(client, { state: "state A", questions }, { cache });
  await ask(client, { state: "state B", questions }, { cache });
  assert.equal(calls, 2);
});

test("ask records spend under the jev service, independent of dataforseo", async () => {
  const fetchImpl = fakeFetch(async () => ({
    answers: { result: { type: "noul", noul: 0.5 } },
    usage: { input_tokens: 1_000_000, output_tokens: 100 },
  }));
  const client = createJevClient({ apiKey: "k", fetchImpl });
  const cache = createKvCache(fakeKvNamespace());
  await ask(client, { state: "s", questions: { result: { type: "noul", instructions: "x" } } }, { cache });
  const jevSpend = await getSpend({ cache, service: "jev" });
  const dfsSpend = await getSpend({ cache, service: "dataforseo" });
  assert.ok(jevSpend.total > 0);
  assert.equal(dfsSpend.total, 0);
});

test("ask requires a client", async () => {
  await assert.rejects(
    () => ask(null, { state: "s", questions: {} }),
    (err) => { assert.equal(err.status, 503); return true; },
  );
});

test("ask blocks once the monthly Jev budget cap is reached", async () => {
  const fetchImpl = fakeFetch(async () => ({
    answers: { result: { type: "noul", noul: 0.5 } },
    usage: { input_tokens: 1_000_000, output_tokens: 0 },
  }));
  const client = createJevClient({ apiKey: "k", fetchImpl });
  const cache = createKvCache(fakeKvNamespace());
  await ask(client, { state: "a", questions: { result: { type: "noul", instructions: "x" } } }, { cache, budgetCapUSD: 0.00004 });
  await assert.rejects(
    () => ask(client, { state: "b", questions: { result: { type: "noul", instructions: "x" } } }, { cache, budgetCapUSD: 0.00004 }),
    (err) => { assert.equal(err.status, 402); assert.match(err.message, /Jev spend cap reached/i); return true; },
  );
});

test("batchAsk runs many items with bounded concurrency and preserves order", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchImpl = fakeFetch(async (url, init, body) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return { answers: { result: { type: "noul", noul: 0.1 } }, usage: { input_tokens: 1, output_tokens: 1 } };
  });
  const client = createJevClient({ apiKey: "k", fetchImpl });
  const items = Array.from({ length: 10 }, (_, i) => ({
    state: `state ${i}`,
    questions: { result: { type: "noul", instructions: "x" } },
  }));
  const results = await batchAsk(client, items, { concurrency: 3 });
  assert.equal(results.length, 10);
  assert.ok(maxInFlight <= 3, `expected concurrency <=3, saw ${maxInFlight}`);
  assert.ok(results.every((r) => !r.error));
});

test("batchAsk stops starting new calls once the budget cap trips mid-batch, keeping earlier results", async () => {
  let calls = 0;
  const fetchImpl = fakeFetch(async () => {
    calls++;
    return { answers: { result: { type: "noul", noul: 0.1 } }, usage: { input_tokens: 1_000_000, output_tokens: 0 } };
  });
  const client = createJevClient({ apiKey: "k", fetchImpl });
  const cache = createKvCache(fakeKvNamespace());
  const items = Array.from({ length: 5 }, (_, i) => ({
    state: `distinct state ${i}`,
    questions: { result: { type: "noul", instructions: "x" } },
  }));
  const results = await batchAsk(client, items, { cache, concurrency: 1, budgetCapUSD: 0.00006 });
  assert.equal(results.length, 5);
  const errored = results.filter((r) => r.error);
  assert.ok(errored.length > 0, "expected at least one item to be blocked by the budget cap");
  assert.ok(errored.every((r) => r.status === 402));
});
