import { withScores } from "./score.mjs";
import { keywordFromDomain, normalizeDomain, publicMetrics } from "./domains.mjs";
import {
  itemsFromKeywordResults,
  itemsFromTask,
  indexByKeyword,
  indexByTarget,
} from "./dataforseo.mjs";
import { checkBudget, getSpend, recordSpend } from "./spend.mjs";

export const MAX_BATCH = 1000;
export { keywordFromDomain };

const BULK = {
  ranks: "/v3/backlinks/bulk_ranks/live",
  refs: "/v3/backlinks/bulk_referring_domains/live",
  spam: "/v3/backlinks/bulk_spam_score/live",
  traffic: "/v3/dataforseo_labs/google/bulk_traffic_estimation/live",
  volume: "/v3/keywords_data/google_ads/search_volume/live",
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Blocks a new paid call once this month's running spend has already reached the cap. */
async function assertBudget({ cache, budgetCapUSD }) {
  if (!cache || budgetCapUSD == null) return;
  const spend = await getSpend({ cache });
  const budget = checkBudget({ total: spend.total, capUSD: budgetCapUSD });
  if (budget.exceeded) {
    const err = new Error(
      `Monthly DataForSEO spend cap reached ($${spend.total.toFixed(2)} of $${budgetCapUSD.toFixed(2)} for ${spend.month}). Raise DATAFORSEO_MONTHLY_BUDGET to continue this month.`,
    );
    err.status = 402;
    throw err;
  }
}

/** Client-supplied brand score: null means "not assessed", else clamp to a sane range. */
const NAME_SCORE_MIN = -5;
const NAME_SCORE_MAX = 20;
function clampNameScore(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(NAME_SCORE_MAX, Math.max(NAME_SCORE_MIN, n));
}

export function missingOrganicCount(row) {
  return !row || row.organic_count == null || row.organic_count === "";
}

export function missingSearchVolume(row, domain) {
  if (!row || row.search_volume == null || row.search_volume === "") return true;
  const expected = keywordFromDomain(domain || row.domain);
  return String(row.keyword || "").trim().toLowerCase() !== expected;
}

function organicFromTraffic(item) {
  const organic = item && item.metrics && item.metrics.organic ? item.metrics.organic : {};
  return {
    etv: num(organic.etv),
    organic_count: num(organic.count),
  };
}

function volumeForDomain(domain, volumeMap) {
  const keyword = keywordFromDomain(domain);
  const item = volumeMap.get(keyword) || {};
  return {
    keyword,
    search_volume: num(item.search_volume),
  };
}

function mergeBulk(domain, ranks, refs, spam, traffic, volume) {
  const r = ranks.get(domain) || {};
  const f = refs.get(domain) || {};
  const s = spam.get(domain) || {};
  const t = organicFromTraffic(traffic.get(domain) || {});
  const v = volumeForDomain(domain, volume);
  return {
    domain,
    rank: num(r.rank),
    referring_domains: num(f.referring_domains),
    referring_main_domains: num(f.referring_main_domains),
    referring_main_domains_nofollow: num(f.referring_main_domains_nofollow),
    spam_score: num(s.spam_score),
    etv: t.etv,
    organic_count: t.organic_count,
    keyword: v.keyword,
    search_volume: v.search_volume,
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

async function postVolume(client, domains) {
  if (!domains.length) return { items: [], cost: 0 };
  const keywords = [];
  const seen = new Set();
  for (const d of domains) {
    const kw = keywordFromDomain(d);
    if (!kw || seen.has(kw)) continue;
    seen.add(kw);
    keywords.push(kw);
  }
  if (!keywords.length) return { items: [], cost: 0 };
  const json = await client.post(BULK.volume, {
    keywords,
    location_code: 2826,
    language_code: "en",
  });
  return itemsFromKeywordResults(json);
}

export async function enrichDomains(rawDomains, {
  force = false,
  cache,
  client,
  nameScores = {},
  budgetCapUSD = null,
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
    return { items: [], cached: 0, fetched: 0, traffic: 0, volume: 0, cost: 0 };
  }

  const cachedMap = cache ? await cache.getMany(domains) : {};
  const hits = [];
  const misses = [];
  const trafficOnly = [];
  const volumeOnly = [];
  for (const d of domains) {
    if (!force && cachedMap[d]) {
      const needTraffic = missingOrganicCount(cachedMap[d]);
      const needVolume = missingSearchVolume(cachedMap[d], d);
      if (needTraffic) trafficOnly.push(d);
      if (needVolume) volumeOnly.push(d);
      if (!needTraffic && !needVolume) hits.push(d);
    } else {
      misses.push(d);
    }
  }

  let cost = 0;
  const fetchedEntries = {};
  const needClient = misses.length || trafficOnly.length || volumeOnly.length;
  if (needClient && !client) {
    const err = new Error("DataForSEO client is not configured");
    err.status = 503;
    throw err;
  }
  if (needClient) await assertBudget({ cache, budgetCapUSD });

  if (misses.length) {
    const task = { targets: misses };
    const [ranksJson, refsJson, spamJson, trafficParsed, volumeParsed] = await Promise.all([
      client.post(BULK.ranks, task),
      client.post(BULK.refs, task),
      client.post(BULK.spam, task),
      postTraffic(client, misses),
      postVolume(client, misses),
    ]);
    const ranks = itemsFromTask(ranksJson);
    const refs = itemsFromTask(refsJson);
    const spam = itemsFromTask(spamJson);
    cost += ranks.cost + refs.cost + spam.cost + trafficParsed.cost + volumeParsed.cost;
    const rankMap = indexByTarget(ranks.items);
    const refMap = indexByTarget(refs.items);
    const spamMap = indexByTarget(spam.items);
    const trafficMap = indexByTarget(trafficParsed.items);
    const volumeMap = indexByKeyword(volumeParsed.items);
    for (const d of misses) {
      fetchedEntries[d] = mergeBulk(d, rankMap, refMap, spamMap, trafficMap, volumeMap);
    }
  }

  if (trafficOnly.length) {
    const trafficParsed = await postTraffic(client, trafficOnly);
    cost += trafficParsed.cost;
    const trafficMap = indexByTarget(trafficParsed.items);
    for (const d of trafficOnly) {
      const t = organicFromTraffic(trafficMap.get(d) || {});
      fetchedEntries[d] = {
        ...(fetchedEntries[d] || cachedMap[d]),
        domain: d,
        etv: t.etv,
        organic_count: t.organic_count,
        checkedAt: (fetchedEntries[d] || cachedMap[d]).checkedAt || new Date().toISOString(),
      };
    }
  }

  if (volumeOnly.length) {
    const volumeParsed = await postVolume(client, volumeOnly);
    cost += volumeParsed.cost;
    const volumeMap = indexByKeyword(volumeParsed.items);
    for (const d of volumeOnly) {
      const v = volumeForDomain(d, volumeMap);
      const prev = fetchedEntries[d] || cachedMap[d];
      fetchedEntries[d] = {
        ...prev,
        domain: d,
        keyword: v.keyword,
        search_volume: v.search_volume,
        checkedAt: prev.checkedAt || new Date().toISOString(),
      };
    }
  }

  if (cache && Object.keys(fetchedEntries).length) {
    await cache.setMany(fetchedEntries);
  }

  const items = domains.map((d) => {
    const fullCache = Boolean(
      !force && cachedMap[d] && !missingOrganicCount(cachedMap[d]) && !missingSearchVolume(cachedMap[d], d),
    );
    const base = fullCache ? cachedMap[d] : (fetchedEntries[d] || cachedMap[d]);
    const nameScore = clampNameScore(nameScores[d] ?? nameScores[base.domain]);
    return publicMetrics(withScores({
      ...base,
      domain: d,
      keyword: base.keyword || keywordFromDomain(d),
      nameScore,
      cached: fullCache,
    }));
  });

  if (cache) await recordSpend({ cache, amount: cost });
  const spend = await getSpend({ cache });

  return {
    items,
    cached: hits.length,
    fetched: misses.length,
    traffic: trafficOnly.length,
    volume: volumeOnly.length,
    cost: roundCost(cost),
    spendTotal: spend.total,
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

/** Whole days since created_datetime, or null if missing/unparseable. */
export function registrationAgeDays(createdDatetime, now = new Date()) {
  if (!createdDatetime) return null;
  const created = new Date(createdDatetime);
  if (Number.isNaN(created.getTime())) return null;
  const days = Math.floor((now.getTime() - created.getTime()) / 864e5);
  return days >= 0 ? days : null;
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
    keyword: keywordFromDomain(domain),
    search_volume: "",
    expiration_datetime: item.expiration_datetime || "",
    created_datetime: item.created_datetime || "",
    registrar: item.registrar || "",
    registrationAgeDays: registrationAgeDays(item.created_datetime),
    registered: item.registered !== false,
    nameScore: null,
  });
}

export async function findExpiring(opts, { client, cache, budgetCapUSD = null } = {}) {
  if (!client) {
    const err = new Error("DataForSEO client is not configured");
    err.status = 503;
    throw err;
  }
  await assertBudget({ cache, budgetCapUSD });
  const task = buildExpiringTask(opts);
  const json = await client.post("/v3/domain_analytics/whois/overview/live", task);
  const parsed = itemsFromTask(json);
  const items = (parsed.items || []).map(mapWhoisItem).filter((r) => r.domain);
  const cost = roundCost(parsed.cost);
  if (cache) await recordSpend({ cache, amount: cost });
  const spend = await getSpend({ cache });
  return {
    items,
    cost,
    total_count: parsed.total_count,
    spendTotal: spend.total,
  };
}
