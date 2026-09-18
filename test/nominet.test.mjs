import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fetchDroplist, DROPLIST_URL, CACHE_TTL_MS } from "../lib/nominet.mjs";
import { createKvCache } from "../lib/kv-cache.mjs";
import { createCache } from "../lib/cache.mjs";

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

async function fileCache() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "nominet-cache-"));
  return createCache(path.join(dir, "cache.json"));
}

/**
 * Exercises fetchDroplist against the two real cache implementations this app
 * actually uses (Cloudflare KV and the local file cache) rather than a
 * hand-rolled mock — a mock that implements a superset interface (like a
 * .get() the Cloudflare KV cache doesn't have) hides exactly this class of
 * bug, which is how "cache.get is not a function" shipped to production.
 */
const CACHE_VARIANTS = [
  { name: "Cloudflare KV", make: async () => createKvCache(fakeKvNamespace()) },
  { name: "local file cache", make: fileCache },
];

function gzipResponse(text) {
  return new Response(gzipSync(Buffer.from(text, "utf8")));
}

for (const { name, make } of CACHE_VARIANTS) {
  test(`[${name}] fetches, decompresses, and caches the droplist`, async () => {
    const cache = await make();
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return gzipResponse("roid,domain,drop_time\n1,lumo.uk,2026-09-20T00:00:00Z\n");
    };
    const out = await fetchDroplist({ cache, fetchImpl, now: () => 1000 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0], DROPLIST_URL);
    assert.equal(out.cached, false);
    assert.equal(out.fetchedAt, 1000);
    assert.match(out.csv, /lumo\.uk/);
  });

  test(`[${name}] a fresh cache entry is served without refetching`, async () => {
    const cache = await make();
    await fetchDroplist({ cache, fetchImpl: async () => gzipResponse("cached,csv\n"), now: () => 1000 });
    const fetchImpl = async () => { throw new Error("should not be called"); };
    const out = await fetchDroplist({ cache, fetchImpl, now: () => 1000 + CACHE_TTL_MS - 1 });
    assert.equal(out.cached, true);
    assert.equal(out.csv, "cached,csv\n");
  });

  test(`[${name}] a stale cache entry is refetched`, async () => {
    const cache = await make();
    await fetchDroplist({ cache, fetchImpl: async () => gzipResponse("old,csv\n"), now: () => 1000 });
    const fetchImpl = async () => gzipResponse("fresh,csv\n");
    const out = await fetchDroplist({ cache, fetchImpl, now: () => 1000 + CACHE_TTL_MS + 1 });
    assert.equal(out.cached, false);
    assert.equal(out.csv, "fresh,csv\n");
  });

  test(`[${name}] force:true refetches even when the cache is fresh`, async () => {
    const cache = await make();
    await fetchDroplist({ cache, fetchImpl: async () => gzipResponse("old,csv\n"), now: () => 1000 });
    let called = false;
    const fetchImpl = async () => { called = true; return gzipResponse("fresh,csv\n"); };
    const out = await fetchDroplist({ cache, force: true, fetchImpl, now: () => 1000 });
    assert.equal(called, true);
    assert.equal(out.cached, false);
    assert.equal(out.csv, "fresh,csv\n");
  });
}

test("a non-OK response throws with the HTTP status", async () => {
  const fetchImpl = async () => new Response("nope", { status: 503 });
  await assert.rejects(
    () => fetchDroplist({ cache: null, fetchImpl }),
    (err) => {
      assert.match(err.message, /HTTP 503/);
      assert.equal(err.status, 502);
      return true;
    },
  );
});

test("works without a cache (always fetches fresh)", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return gzipResponse("no,cache\n"); };
  const first = await fetchDroplist({ cache: null, fetchImpl });
  const second = await fetchDroplist({ cache: null, fetchImpl });
  assert.equal(calls, 2);
  assert.equal(first.cached, false);
  assert.equal(second.cached, false);
});
