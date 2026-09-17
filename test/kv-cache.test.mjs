import { test } from "node:test";
import assert from "node:assert/strict";
import { createKvCache } from "../lib/kv-cache.mjs";

test("KV cache stores and returns domain metrics", async () => {
  const store = new Map();
  const ns = {
    async get(key) { return store.get(key) || null; },
    async put(key, value) { store.set(key, value); },
  };
  const cache = createKvCache(ns);
  await cache.setMany({ "a.co.uk": { domain: "a.co.uk", rank: 9 } });
  const got = await cache.getMany(["a.co.uk", "missing.uk"]);
  assert.equal(got["a.co.uk"].rank, 9);
  assert.equal(got["missing.uk"], undefined);
});
