import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCache } from "../lib/cache.mjs";
import { enrichDomains, buildExpiringTask, findExpiring, keywordFromDomain, registrationAgeDays, verifyDomains } from "../lib/enrich.mjs";
import { getSpend } from "../lib/spend.mjs";

function bulkPayload(pathname, items, cost = 0.01) {
  if (pathname.includes("search_volume")) {
    return {
      status_code: 20000,
      cost,
      tasks: [{
        status_code: 20000,
        cost,
        result: items,
        data: { function: "search_volume" },
      }],
    };
  }
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
      calls.push({ pathname, task: { ...task }, targets: [...(task.targets || [])], keywords: [...(task.keywords || [])] });
      if (pathname.includes("search_volume")) {
        const items = (task.keywords || []).map((keyword) => ({
          keyword,
          search_volume: keyword === "prep schools" ? 12100 : 40,
        }));
        return bulkPayload(pathname, items);
      }
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
  assert.equal(first.volume, 0);
  assert.equal(calls.length, 5);
  const trafficCall = calls.find((c) => c.pathname.includes("traffic"));
  assert.ok(trafficCall);
  assert.equal(trafficCall.task.location_name, "United Kingdom");
  assert.equal(trafficCall.task.language_code, "en");
  const volumeCall = calls.find((c) => c.pathname.includes("search_volume"));
  assert.ok(volumeCall);
  assert.equal(volumeCall.task.location_code, 2826);
  assert.deepEqual(volumeCall.task.keywords, ["example"]);
  assert.equal(first.items[0].domain, "example.co.uk");
  assert.equal(first.items[0].rank, 120);
  assert.equal(first.items[0].referring_main_domains, 11);
  assert.equal(first.items[0].referring_main_domains_nofollow, 2);
  assert.equal(first.items[0].etv, 18.5);
  assert.equal(first.items[0].organic_count, 7);
  assert.equal(first.items[0].search_volume, 40);
  assert.equal(first.items[0].keyword, "example");
  assert.equal(first.items[0].nameScore, 4.5);
  assert.equal(first.items[0].verdict, "buy");
  assert.ok(first.items[0].buyScore > 4.5);
  assert.ok(first.items[0].seoScore > 0);

  const second = await enrichDomains(["example.co.uk", "example.co.uk"], { cache, client });
  assert.equal(second.fetched, 0);
  assert.equal(second.cached, 1);
  assert.equal(second.traffic, 0);
  assert.equal(second.volume, 0);
  assert.equal(calls.length, 5, "cache hit must not POST again");
  assert.equal(second.items[0].cached, true);
  assert.equal(second.items[0].rank, 120);
  assert.equal(second.items[0].organic_count, 7);
  assert.equal(second.items[0].search_volume, 40);

  const disk = JSON.parse(await readFile(path.join(dir, "seo-cache.json"), "utf8"));
  assert.ok(disk["example.co.uk"]);
  assert.equal(disk["example.co.uk"].organic_count, 7);
  assert.equal(disk["example.co.uk"].search_volume, 40);
});

test("old cache missing organic_count backfills traffic and volume", async () => {
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
  assert.equal(out.volume, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.some((c) => c.pathname.includes("bulk_traffic_estimation")));
  assert.ok(calls.some((c) => c.pathname.includes("search_volume")));
  assert.equal(out.items[0].rank, 80);
  assert.equal(out.items[0].etv, 18.5);
  assert.equal(out.items[0].organic_count, 7);
  assert.equal(out.items[0].search_volume, 40);
  assert.equal(out.items[0].verdict, "buy");

  const again = await enrichDomains(["old.uk"], { cache, client });
  assert.equal(again.cached, 1);
  assert.equal(again.traffic, 0);
  assert.equal(again.volume, 0);
  assert.equal(calls.length, 2, "full cache after traffic+volume backfill must not refetch");
});

test("old cache missing search_volume backfills volume only", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seo-cache-"));
  const cache = createCache(path.join(dir, "seo-cache.json"));
  await cache.setMany({
    "prep-schools.co.uk": {
      domain: "prep-schools.co.uk",
      rank: 80,
      referring_domains: 20,
      referring_main_domains: 15,
      spam_score: 5,
      etv: 18.5,
      organic_count: 7,
      checkedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  const calls = [];
  const client = mockClient(calls);
  const out = await enrichDomains(["prep-schools.co.uk"], { cache, client });
  assert.equal(out.fetched, 0);
  assert.equal(out.cached, 0);
  assert.equal(out.traffic, 0);
  assert.equal(out.volume, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].pathname, /search_volume/);
  assert.deepEqual(calls[0].task.keywords, ["prep schools"]);
  assert.equal(keywordFromDomain("prep-schools.co.uk"), "prep schools");
  assert.equal(out.items[0].rank, 80);
  assert.equal(out.items[0].etv, 18.5);
  assert.equal(out.items[0].organic_count, 7);
  assert.equal(out.items[0].search_volume, 12100);
  assert.equal(out.items[0].keyword, "prep schools");
  assert.equal(out.items[0].verdict, "buy");

  const again = await enrichDomains(["prep-schools.co.uk"], { cache, client });
  assert.equal(again.cached, 1);
  assert.equal(again.volume, 0);
  assert.equal(calls.length, 1);
});

test("glued names query the spaced dictionary phrase", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seo-cache-"));
  const cache = createCache(path.join(dir, "seo-cache.json"));
  const calls = [];
  const client = mockClient(calls);
  const out = await enrichDomains(["prepschools.co.uk"], { cache, client });
  const volumeCall = calls.find((c) => c.pathname.includes("search_volume"));
  assert.ok(volumeCall);
  assert.deepEqual(volumeCall.task.keywords, ["prep schools"]);
  assert.equal(keywordFromDomain("prepschools.co.uk"), "prep schools");
  assert.equal(out.items[0].keyword, "prep schools");
  assert.equal(out.items[0].search_volume, 12100);
});

test("old cache with glued keyword backfills the spaced phrase", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seo-cache-"));
  const cache = createCache(path.join(dir, "seo-cache.json"));
  await cache.setMany({
    "prepschools.co.uk": {
      domain: "prepschools.co.uk",
      rank: 80,
      referring_domains: 20,
      referring_main_domains: 15,
      spam_score: 5,
      etv: 18.5,
      organic_count: 7,
      keyword: "prepschools",
      search_volume: 10,
      checkedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  const calls = [];
  const client = mockClient(calls);
  const out = await enrichDomains(["prepschools.co.uk"], { cache, client });
  assert.equal(out.fetched, 0);
  assert.equal(out.cached, 0);
  assert.equal(out.traffic, 0);
  assert.equal(out.volume, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].pathname, /search_volume/);
  assert.deepEqual(calls[0].task.keywords, ["prep schools"]);
  assert.equal(out.items[0].keyword, "prep schools");
  assert.equal(out.items[0].search_volume, 12100);
  assert.equal(out.items[0].organic_count, 7);

  const again = await enrichDomains(["prepschools.co.uk"], { cache, client });
  assert.equal(again.cached, 1);
  assert.equal(again.volume, 0);
  assert.equal(calls.length, 1);
});

test("force:true overwrites cache and fetches again", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seo-cache-"));
  const cache = createCache(path.join(dir, "seo-cache.json"));
  const calls = [];
  const client = mockClient(calls);
  await enrichDomains(["fresh.uk"], { cache, client });
  await enrichDomains(["fresh.uk"], { cache, client, force: true });
  assert.equal(calls.length, 10);
});

test("nameScore is null (not 0) when the caller never assessed brand quality", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seo-cache-"));
  const cache = createCache(path.join(dir, "seo-cache.json"));
  const calls = [];
  const client = mockClient(calls);
  const out = await enrichDomains(["noscore.uk"], { cache, client });
  assert.equal(out.items[0].nameScore, null);
});

test("a client-supplied nameScore is clamped to a sane range", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seo-cache-"));
  const cache = createCache(path.join(dir, "seo-cache.json"));
  const calls = [];
  const client = mockClient(calls);
  const out = await enrichDomains(["wild.uk"], { cache, client, nameScores: { "wild.uk": 999 } });
  assert.equal(out.items[0].nameScore, 20);
});

test("findExpiring results carry a null nameScore — they were never through the Nominet hunt", async () => {
  const client = {
    async post() {
      return {
        status_code: 20000,
        cost: 0.02,
        tasks: [{
          status_code: 20000,
          cost: 0.02,
          result: [{
            total_count: 1,
            items_count: 1,
            items: [{
              domain: "found.uk",
              expiration_datetime: "2026-09-25 00:00:00 +00:00",
              created_datetime: "2010-09-25 00:00:00 +00:00",
              registrar: "Example Registrar Ltd",
              registered: true,
              backlinks_info: { referring_domains: 3, referring_main_domains: 3, referring_main_domains_nofollow: 0 },
              metrics: { organic: { etv: 0, count: 0 } },
            }],
          }],
        }],
      };
    },
  };
  const out = await findExpiring({ tld: "uk" }, { client });
  assert.equal(out.items[0].domain, "found.uk");
  assert.equal(out.items[0].nameScore, null);
  assert.equal(out.items[0].registrar, "Example Registrar Ltd");
  assert.equal(out.items[0].created_datetime, "2010-09-25 00:00:00 +00:00");
  assert.ok(out.items[0].registrationAgeDays > 5800, "16 years old should be well over 5800 days");
});

test("registrationAgeDays computes whole days and handles missing/bad input", () => {
  const now = new Date("2026-09-18T00:00:00Z");
  assert.equal(registrationAgeDays("2026-09-08T00:00:00Z", now), 10);
  assert.equal(registrationAgeDays("", now), null);
  assert.equal(registrationAgeDays(null, now), null);
  assert.equal(registrationAgeDays("not a date", now), null);
  assert.equal(registrationAgeDays("2026-09-20T00:00:00Z", now), null);
});

test("enrichDomains and findExpiring track running monthly spend", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seo-cache-"));
  const cache = createCache(path.join(dir, "seo-cache.json"));
  const calls = [];
  const client = mockClient(calls);
  const first = await enrichDomains(["spendcheck.uk"], { cache, client });
  assert.ok(first.spendTotal > 0);
  const spend = await getSpend({ cache });
  assert.equal(spend.total, first.spendTotal);

  const whoisClient = {
    async post() {
      return {
        status_code: 20000,
        cost: 0.03,
        tasks: [{ status_code: 20000, cost: 0.03, result: [{ items: [] }] }],
      };
    },
  };
  const expiring = await findExpiring({ tld: "uk" }, { client: whoisClient, cache });
  assert.equal(Math.round((expiring.spendTotal - first.spendTotal) * 100) / 100, 0.03);
});

test("enrichDomains blocks new paid calls once the monthly budget cap is reached", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seo-cache-"));
  const cache = createCache(path.join(dir, "seo-cache.json"));
  const calls = [];
  const client = mockClient(calls);
  await enrichDomains(["over.uk"], { cache, client, budgetCapUSD: 0.01 });
  const before = calls.length;
  await assert.rejects(
    () => enrichDomains(["over2.uk"], { cache, client, budgetCapUSD: 0.01 }),
    (err) => {
      assert.equal(err.status, 402);
      assert.match(err.message, /spend cap reached/i);
      return true;
    },
  );
  assert.equal(calls.length, before, "no new DataForSEO calls should be made once the cap is reached");
});

test("a cache hit with no new paid calls is never blocked by the budget cap", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seo-cache-"));
  const cache = createCache(path.join(dir, "seo-cache.json"));
  const calls = [];
  const client = mockClient(calls);
  await enrichDomains(["cached.uk"], { cache, client, budgetCapUSD: 0.01 });
  const before = calls.length;
  const out = await enrichDomains(["cached.uk"], { cache, client, budgetCapUSD: 0.01 });
  assert.equal(calls.length, before);
  assert.equal(out.cached, 1);
});

test("verifyDomains reports gained/lost referring domains per target", async () => {
  const calls = [];
  const client = {
    async post(pathname, task) {
      calls.push({ pathname, task });
      return {
        status_code: 20000,
        cost: 0.04,
        tasks: [{
          status_code: 20000,
          cost: 0.04,
          result: [{
            items_count: 2,
            items: [
              { target: "stable.uk", new_referring_domains: 2, lost_referring_domains: 1 },
              { target: "declining.uk", new_referring_domains: 0, lost_referring_domains: 35 },
            ],
          }],
        }],
      };
    },
  };
  const out = await verifyDomains(["stable.uk", "declining.uk"], { client });
  assert.equal(calls.length, 1);
  assert.match(calls[0].pathname, /bulk_new_lost_referring_domains/);
  assert.deepEqual(calls[0].task, { targets: ["stable.uk", "declining.uk"] });
  const declining = out.items.find((i) => i.domain === "declining.uk");
  assert.equal(declining.newReferringDomains, 0);
  assert.equal(declining.lostReferringDomains, 35);
  assert.equal(out.cost, 0.04);
});

test("verifyDomains defaults a target missing from the response to zero, not a crash", async () => {
  const client = {
    async post() {
      return {
        status_code: 20000,
        cost: 0,
        tasks: [{ status_code: 20000, cost: 0, result: [{ items: [] }] }],
      };
    },
  };
  const out = await verifyDomains(["missing.uk"], { client });
  assert.equal(out.items[0].newReferringDomains, 0);
  assert.equal(out.items[0].lostReferringDomains, 0);
});

test("verifyDomains requires a client and respects the budget cap", async () => {
  await assert.rejects(
    () => verifyDomains(["a.uk"], { client: null }),
    (err) => { assert.equal(err.status, 503); return true; },
  );

  const dir = await mkdtemp(path.join(os.tmpdir(), "seo-cache-"));
  const cache = createCache(path.join(dir, "seo-cache.json"));
  const client = {
    async post() {
      return { status_code: 20000, cost: 0.02, tasks: [{ status_code: 20000, cost: 0.02, result: [{ items: [] }] }] };
    },
  };
  await verifyDomains(["a.uk"], { cache, client, budgetCapUSD: 0.01 });
  await assert.rejects(
    () => verifyDomains(["b.uk"], { cache, client, budgetCapUSD: 0.01 }),
    (err) => { assert.equal(err.status, 402); return true; },
  );
});

test("buildExpiringTask filters UK names expiring soon with a backlink floor", () => {
  const task = buildExpiringTask({ days: 3, tld: "uk", minRefDomains: 10, limit: 50 });
  assert.equal(task.limit, 50);
  const joined = JSON.stringify(task.filters);
  assert.match(joined, /expiration_datetime/);
  assert.match(joined, /\["tld","=","uk"\]/);
  assert.match(joined, /referring_domains/);
});
