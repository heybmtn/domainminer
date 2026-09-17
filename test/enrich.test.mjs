import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCache } from "../lib/cache.mjs";
import { enrichDomains, buildExpiringTask } from "../lib/enrich.mjs";

function bulkPayload(pathname, items, cost = 0.01) {
  const fn = pathname.includes("ranks") ? "bulk_ranks"
    : pathname.includes("spam") ? "bulk_spam_score"
    : pathname.includes("traffic") ? "bulk_traffic_estimation"
    : "bulk_referring_domains";
  return {
    status_code: 20000,
    cost,
    tasks: [{
      status_code: 20000,
      cost,
      result: [{ items_count: items.length, items }],
      data: { function: fn },
    }],
  };
}

function mockClient(calls) {
  return {
    async post(pathname, task) {
      calls.push({ pathname, task: { ...task }, targets: [...(task.targets || [])] });
      const items = (task.targets || []).map((target) => {
        if (pathname.includes("ranks")) return { target, rank: 120 };
        if (pathname.includes("spam")) return { target, spam_score: 8 };
        if (pathname.includes("traffic")) {
          return { target, metrics: { organic: { etv: 18.5, count: 7 } } };
        }
        return {
          target,
          referring_domains: 14,
          referring_main_domains: 11,
          referring_main_domains_nofollow: 2,
        };
      });
      return bulkPayload(pathname, items);
    },
  };
}

test("second enrich of the same domain does not call DataForSEO", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seo-cache-"));
  const cache = createCache(path.join(dir, "seo-cache.json"));
  const calls = [];
  const client = mockClient(calls);

  const first = await enrichDomains(["HTTPS://WWW.Example.co.uk"], {
    cache,
    client,
    nameScores: { "example.co.uk": 4.5 },
  });
  assert.equal(first.fetched, 1);
  assert.equal(first.cached, 0);
  assert.equal(first.traffic, 0);
  assert.equal(calls.length, 4);
  const trafficCall = calls.find((c) => c.pathname.includes("traffic"));
  assert.ok(trafficCall);
  assert.equal(trafficCall.task.location_name, "United Kingdom");
  assert.equal(trafficCall.task.language_code, "en");
  assert.equal(first.items[0].domain, "example.co.uk");
  assert.equal(first.items[0].rank, 120);
  assert.equal(first.items[0].referring_main_domains, 11);
  assert.equal(first.items[0].referring_main_domains_nofollow, 2);
  assert.equal(first.items[0].etv, 18.5);
  assert.equal(first.items[0].organic_count, 7);
  assert.equal(first.items[0].nameScore, 4.5);
  assert.equal(first.items[0].verdict, "buy");
  assert.ok(first.items[0].buyScore > 4.5);
  assert.ok(first.items[0].seoScore > 0);

  const second = await enrichDomains(["example.co.uk", "example.co.uk"], { cache, client });
  assert.equal(second.fetched, 0);
  assert.equal(second.cached, 1);
  assert.equal(second.traffic, 0);
  assert.equal(calls.length, 4, "cache hit must not POST again");
  assert.equal(second.items[0].cached, true);
  assert.equal(second.items[0].rank, 120);
  assert.equal(second.items[0].organic_count, 7);

  const disk = JSON.parse(await readFile(path.join(dir, "seo-cache.json"), "utf8"));
  assert.ok(disk["example.co.uk"]);
  assert.equal(disk["example.co.uk"].organic_count, 7);
});

test("old cache missing organic_count backfills traffic only", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seo-cache-"));
  const cache = createCache(path.join(dir, "seo-cache.json"));
  await cache.setMany({
    "old.uk": {
      domain: "old.uk",
      rank: 80,
      referring_domains: 20,
      referring_main_domains: 15,
      spam_score: 5,
      etv: 0,
      checkedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  const calls = [];
  const client = mockClient(calls);
  const out = await enrichDomains(["old.uk"], { cache, client });
  assert.equal(out.fetched, 0);
  assert.equal(out.cached, 0);
  assert.equal(out.traffic, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].pathname, /bulk_traffic_estimation/);
  assert.equal(out.items[0].rank, 80);
  assert.equal(out.items[0].etv, 18.5);
  assert.equal(out.items[0].organic_count, 7);
  assert.equal(out.items[0].verdict, "buy");

  const again = await enrichDomains(["old.uk"], { cache, client });
  assert.equal(again.cached, 1);
  assert.equal(again.traffic, 0);
  assert.equal(calls.length, 1, "organic_count 0 after a real fetch must not refetch; 7 is a hit");
});

test("force:true overwrites cache and fetches again", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seo-cache-"));
  const cache = createCache(path.join(dir, "seo-cache.json"));
  const calls = [];
  const client = mockClient(calls);
  await enrichDomains(["fresh.uk"], { cache, client });
  await enrichDomains(["fresh.uk"], { cache, client, force: true });
  assert.equal(calls.length, 8);
});

test("buildExpiringTask filters UK names expiring soon with a backlink floor", () => {
  const task = buildExpiringTask({ days: 3, tld: "uk", minRefDomains: 10, limit: 50 });
  assert.equal(task.limit, 50);
  const joined = JSON.stringify(task.filters);
  assert.match(joined, /expiration_datetime/);
  assert.match(joined, /\["tld","=","uk"\]/);
  assert.match(joined, /referring_domains/);
});
