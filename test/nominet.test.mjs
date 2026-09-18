import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { fetchDroplist, DROPLIST_URL, CACHE_TTL_MS } from "../lib/nominet.mjs";

function memCache() {
  const store = new Map();
  return {
    store,
    async get(key) { return store.get(key) || null; },
    async setMany(entries) {
      for (const [k, v] of Object.entries(entries)) store.set(k, v);
    },
  };
}

function gzipResponse(text) {
  return new Response(gzipSync(Buffer.from(text, "utf8")));
}

test("fetches, decompresses, and caches the droplist", async () => {
  const cache = memCache();
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

test("a fresh cache entry is served without refetching", async () => {
  const cache = memCache();
  await cache.setMany({ "nominet-droplist": { fetchedAt: 1000, csv: "cached,csv\n" } });
  const fetchImpl = async () => { throw new Error("should not be called"); };
  const out = await fetchDroplist({ cache, fetchImpl, now: () => 1000 + CACHE_TTL_MS - 1 });
  assert.equal(out.cached, true);
  assert.equal(out.csv, "cached,csv\n");
});

test("a stale cache entry is refetched", async () => {
  const cache = memCache();
  await cache.setMany({ "nominet-droplist": { fetchedAt: 1000, csv: "old,csv\n" } });
  const fetchImpl = async () => gzipResponse("fresh,csv\n");
  const out = await fetchDroplist({ cache, fetchImpl, now: () => 1000 + CACHE_TTL_MS + 1 });
  assert.equal(out.cached, false);
  assert.equal(out.csv, "fresh,csv\n");
});

test("force:true refetches even when the cache is fresh", async () => {
  const cache = memCache();
  await cache.setMany({ "nominet-droplist": { fetchedAt: 1000, csv: "old,csv\n" } });
  let called = false;
  const fetchImpl = async () => { called = true; return gzipResponse("fresh,csv\n"); };
  const out = await fetchDroplist({ cache, force: true, fetchImpl, now: () => 1000 });
  assert.equal(called, true);
  assert.equal(out.cached, false);
  assert.equal(out.csv, "fresh,csv\n");
});

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
