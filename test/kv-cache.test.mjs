import { test } from "node:test";
import assert from "node:assert/strict";
import { createKvCache } from "../lib/kv-cache.mjs";

function fakeNamespace() {
  const store = new Map();
  return {
    store,
    async get(key) { return store.get(key) || null; },
    async put(key, value) { store.set(key, value); },
    async list({ prefix = "", cursor } = {}) {
      const keys = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort();
      const start = cursor ? Number(cursor) : 0;
      const pageSize = 2;
      const page = keys.slice(start, start + pageSize);
      const end = start + page.length;
      return {
        keys: page.map((name) => ({ name })),
        list_complete: end >= keys.length,
        cursor: end >= keys.length ? undefined : String(end),
      };
    },
  };
}

test("KV cache stores and returns domain metrics", async () => {
  const ns = fakeNamespace();
  const cache = createKvCache(ns);
  await cache.setMany({ "a.co.uk": { domain: "a.co.uk", rank: 9 } });
  const got = await cache.getMany(["a.co.uk", "missing.uk"]);
  assert.equal(got["a.co.uk"].rank, 9);
  assert.equal(got["missing.uk"], undefined);
});

test("size() counts cached entries across paginated list() calls", async () => {
  const ns = fakeNamespace();
  const cache = createKvCache(ns);
  assert.equal(await cache.size(), 0);
  await cache.setMany({
    "a.co.uk": { domain: "a.co.uk" },
    "b.co.uk": { domain: "b.co.uk" },
    "c.co.uk": { domain: "c.co.uk" },
    "d.co.uk": { domain: "d.co.uk" },
    "e.co.uk": { domain: "e.co.uk" },
  });
  assert.equal(await cache.size(), 5);
});

test("size() without a KV namespace stays a cheap no-op", async () => {
  const cache = createKvCache(undefined);
  assert.equal(await cache.size(), 0);
});
