import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBudget, getSpend, parseBudgetCap, recordSpend } from "../lib/spend.mjs";
import { createKvCache } from "../lib/kv-cache.mjs";

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

test("recordSpend accumulates within the same UTC month", async () => {
  const cache = createKvCache(fakeKvNamespace());
  const now = () => new Date("2026-09-05T00:00:00Z");
  await recordSpend({ cache, service: "dataforseo", amount: 1.5, now });
  await recordSpend({ cache, service: "dataforseo", amount: 2.25, now });
  const spend = await getSpend({ cache, service: "dataforseo", now });
  assert.equal(spend.month, "2026-09");
  assert.equal(spend.total, 3.75);
});

test("recordSpend keys by UTC month, not local date string", async () => {
  const cache = createKvCache(fakeKvNamespace());
  await recordSpend({ cache, service: "dataforseo", amount: 5, now: () => new Date("2026-09-30T23:00:00Z") });
  await recordSpend({ cache, service: "dataforseo", amount: 7, now: () => new Date("2026-10-01T01:00:00Z") });
  const sep = await getSpend({ cache, service: "dataforseo", now: () => new Date("2026-09-15T00:00:00Z") });
  const oct = await getSpend({ cache, service: "dataforseo", now: () => new Date("2026-10-15T00:00:00Z") });
  assert.equal(sep.total, 5);
  assert.equal(oct.total, 7);
});

test("different services track spend independently", async () => {
  const cache = createKvCache(fakeKvNamespace());
  const now = () => new Date("2026-09-05T00:00:00Z");
  await recordSpend({ cache, service: "dataforseo", amount: 10, now });
  await recordSpend({ cache, service: "jev", amount: 0.02, now });
  const dfs = await getSpend({ cache, service: "dataforseo", now });
  const jev = await getSpend({ cache, service: "jev", now });
  assert.equal(dfs.total, 10);
  assert.equal(jev.total, 0.02);
});

test("recordSpend is a no-op for zero, negative, or missing cache", async () => {
  const cache = createKvCache(fakeKvNamespace());
  await recordSpend({ cache, service: "dataforseo", amount: 0 });
  await recordSpend({ cache, service: "dataforseo", amount: -5 });
  await recordSpend({ cache: null, service: "dataforseo", amount: 10 });
  const spend = await getSpend({ cache, service: "dataforseo" });
  assert.equal(spend.total, 0);
});

test("getSpend with no cache returns a zero total for the current month", async () => {
  const spend = await getSpend({ cache: null, service: "dataforseo", now: () => new Date("2026-09-05T00:00:00Z") });
  assert.equal(spend.month, "2026-09");
  assert.equal(spend.total, 0);
});

test("checkBudget: no cap set never blocks", () => {
  assert.equal(checkBudget({ total: 999, capUSD: null }).exceeded, false);
  assert.equal(checkBudget({ total: 999, capUSD: undefined }).exceeded, false);
  assert.equal(checkBudget({ total: 999, capUSD: 0 }).exceeded, false);
});

test("checkBudget blocks once total reaches the cap", () => {
  assert.equal(checkBudget({ total: 49.99, capUSD: 50 }).exceeded, false);
  assert.equal(checkBudget({ total: 50, capUSD: 50 }).exceeded, true);
  assert.equal(checkBudget({ total: 50.01, capUSD: 50 }).exceeded, true);
});

test("parseBudgetCap rejects blank, non-numeric, and non-positive values", () => {
  assert.equal(parseBudgetCap(""), null);
  assert.equal(parseBudgetCap(undefined), null);
  assert.equal(parseBudgetCap("abc"), null);
  assert.equal(parseBudgetCap("0"), null);
  assert.equal(parseBudgetCap("-5"), null);
  assert.equal(parseBudgetCap("50"), 50);
  assert.equal(parseBudgetCap("12.5"), 12.5);
});
