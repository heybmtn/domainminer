import { withScores } from "./score.mjs";
import { normalizeDomain, publicMetrics } from "./domains.mjs";
import { itemsFromTask, indexByTarget } from "./dataforseo.mjs";

export const MAX_BATCH = 1000;

const BULK = {
  ranks: "/v3/backlinks/bulk_ranks/live",
  refs: "/v3/backlinks/bulk_referring_domains/live",
  spam: "/v3/backlinks/bulk_spam_score/live",
  traffic: "/v3/dataforseo_labs/google/bulk_traffic_estimation/live",
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function missingOrganicCount(row) {
  return !row || row.organic_count == null || row.organic_count === "";
}

function organicFromTraffic(item) {
  const organic = item && item.metrics && item.metrics.organic ? item.metrics.organic : {};
  return {
    etv: num(organic.etv),
    organic_count: num(organic.count),
  };
}

function mergeBulk(domain, ranks, refs, spam, traffic) {
  const r = ranks.get(domain) || {};
  const f = refs.get(domain) || {};
  const s = spam.get(domain) || {};
  const t = organicFromTraffic(traffic.get(domain) || {});
  return {
    domain,
    rank: num(r.rank),
    referring_domains: num(f.referring_domains),
    referring_main_domains: num(f.referring_main_domains),
    referring_main_domains_nofollow: num(f.referring_main_domains_nofollow),
    spam_score: num(s.spam_score),
    etv: t.etv,
    organic_count: t.organic_count,
    checkedAt: new Date().toISOString(),
  };
}

async function postTraffic(client, targets) {
  if (!targets.length) return { items: [], cost: 0 };
  const json = await client.post(BULK.traffic, {
    targets,
    location_name: "United Kingdom",
    language_code: "en",
  });
  return itemsFromTask(json);
}

export async function enrichDomains(rawDomains, {
  force = false,
  cache,
  client,
  nameScores = {},
} = {}) {
  const seen = new Set();
  const domains = [];
  for (const raw of rawDomains || []) {
    const d = normalizeDomain(raw);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    domains.push(d);
    if (domains.length >= MAX_BATCH) break;
  }

  if (!domains.length) {
    return { items: [], cached: 0, fetched: 0, traffic: 0, cost: 0 };
  }

  const cachedMap = cache ? await cache.getMany(domains) : {};
  const hits = [];
  const misses = [];
  const trafficOnly = [];
  for (const d of domains) {
    if (!force && cachedMap[d]) {
      if (missingOrganicCount(cachedMap[d])) trafficOnly.push(d);
      else hits.push(d);
    } else {
      misses.push(d);
    }
  }

  let cost = 0;
  const fetchedEntries = {};
  const needClient = misses.length || trafficOnly.length;
  if (needClient && !client) {
    const err = new Error("DataForSEO client is not configured");
    err.status = 503;
    throw err;
  }

  if (misses.length) {
    const task = { targets: misses };
    const [ranksJson, refsJson, spamJson, trafficParsed] = await Promise.all([
      client.post(BULK.ranks, task),
      client.post(BULK.refs, task),
      client.post(BULK.spam, task),
      postTraffic(client, misses),
    ]);
    const ranks = itemsFromTask(ranksJson);
    const refs = itemsFromTask(refsJson);
    const spam = itemsFromTask(spamJson);
    cost += ranks.cost + refs.cost + spam.cost + trafficParsed.cost;
    const rankMap = indexByTarget(ranks.items);
    const refMap = indexByTarget(refs.items);
    const spamMap = indexByTarget(spam.items);
    const trafficMap = indexByTarget(trafficParsed.items);
    for (const d of misses) {
      fetchedEntries[d] = mergeBulk(d, rankMap, refMap, spamMap, trafficMap);
    }
  }

  if (trafficOnly.length) {
    const trafficParsed = await postTraffic(client, trafficOnly);
    cost += trafficParsed.cost;
    const trafficMap = indexByTarget(trafficParsed.items);
    for (const d of trafficOnly) {
      const t = organicFromTraffic(trafficMap.get(d) || {});
      fetchedEntries[d] = {
        ...cachedMap[d],
        domain: d,
        etv: t.etv,
        organic_count: t.organic_count,
        checkedAt: cachedMap[d].checkedAt || new Date().toISOString(),
      };
    }
  }

  if (cache && Object.keys(fetchedEntries).length) {
    await cache.setMany(fetchedEntries);
  }

  const items = domains.map((d) => {
    const fullCache = Boolean(!force && cachedMap[d] && !missingOrganicCount(cachedMap[d]));
    const base = fullCache ? cachedMap[d] : (fetchedEntries[d] || cachedMap[d]);
    const nameScore = Number(nameScores[d] ?? nameScores[base.domain] ?? 0) || 0;
    return publicMetrics(withScores({
      ...base,
      domain: d,
      nameScore,
      cached: fullCache,
    }));
  });

  return {
    items,
    cached: hits.length,
    fetched: misses.length,
    traffic: trafficOnly.length,
    cost: roundCost(cost),
  };
}

function roundCost(n) {
  return Math.round(n * 1e6) / 1e6;
}

function isoUtc(date) {
  const pad = (x) => String(x).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +00:00`;
}

export function buildExpiringTask({
  days = 7,
  registered = true,
  tld = "uk",
  minRefDomains = 5,
  minOrganic = 0,
  limit = 100,
} = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), MAX_BATCH);
  const filters = [];
  const push = (clause) => {
    if (filters.length) filters.push("and");
    filters.push(clause);
  };

  if (registered === false) {
    push(["registered", "=", false]);
  } else {
    const now = new Date();
    const until = new Date(now.getTime() + Math.max(Number(days) || 7, 1) * 864e5);
    push(["expiration_datetime", ">=", isoUtc(now)]);
    push(["expiration_datetime", "<=", isoUtc(until)]);
  }

  const tldValue = String(tld || "uk").replace(/^\./, "").toLowerCase();
  if (tldValue === "co.uk") {
    push(["domain", "like", "%.co.uk"]);
  } else if (tldValue) {
    push(["tld", "=", tldValue]);
  }

  const minRef = Number(minRefDomains);
  if (Number.isFinite(minRef) && minRef > 0) {
    push(["backlinks_info.referring_domains", ">=", minRef]);
  }
  const minOrg = Number(minOrganic);
  if (Number.isFinite(minOrg) && minOrg > 0) {
    push(["metrics.organic.count", ">=", minOrg]);
  }

  const order_by = registered === false
    ? ["backlinks_info.referring_domains,desc", "metrics.organic.etv,desc"]
    : ["expiration_datetime,asc", "backlinks_info.referring_domains,desc"];

  return { limit: lim, filters, order_by };
}

export function mapWhoisItem(item) {
  const domain = normalizeDomain(item.domain) || String(item.domain || "").toLowerCase();
  const organic = item.metrics?.organic || {};
  const backlinks = item.backlinks_info || {};
  return withScores({
    domain,
    rank: 0,
    referring_domains: num(backlinks.referring_domains),
    referring_main_domains: num(backlinks.referring_main_domains),
    referring_main_domains_nofollow: num(backlinks.referring_main_domains_nofollow),
    spam_score: 0,
    etv: num(organic.etv),
    organic_count: num(organic.count),
    expiration_datetime: item.expiration_datetime || "",
    registered: item.registered !== false,
    nameScore: 0,
  });
}

export async function findExpiring(opts, { client } = {}) {
  if (!client) {
    const err = new Error("DataForSEO client is not configured");
    err.status = 503;
    throw err;
  }
  const task = buildExpiringTask(opts);
  const json = await client.post("/v3/domain_analytics/whois/overview/live", task);
  const parsed = itemsFromTask(json);
  const items = (parsed.items || []).map(mapWhoisItem).filter((r) => r.domain);
  return {
    items,
    cost: roundCost(parsed.cost),
    total_count: parsed.total_count,
  };
}
