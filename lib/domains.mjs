const MAX_LABEL = 253;

/** Strip URL junk and lowercase. Returns null if the result is not a plausible hostname. */
export function normalizeDomain(input) {
  if (input == null) return null;
  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/[\s,;]+/g, "");
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  s = s.replace(/\.+$/, "");
  s = s.replace(/:\d+$/, "");
  if (!s || s.length > MAX_LABEL) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) {
    return null;
  }
  return s;
}

export function parseDomainList(raw, { limit = 1000 } = {}) {
  const text = String(raw || "");
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  const seen = new Set();
  const domains = [];
  for (const part of parts) {
    const d = normalizeDomain(part);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    domains.push(d);
    if (domains.length >= limit) break;
  }
  return domains;
}

export function publicMetrics(row) {
  return {
    domain: row.domain,
    nameScore: row.nameScore ?? 0,
    rank: row.rank ?? 0,
    referring_domains: row.referring_domains ?? 0,
    referring_main_domains: row.referring_main_domains ?? 0,
    referring_main_domains_nofollow: row.referring_main_domains_nofollow ?? 0,
    dofollow_main: row.dofollow_main ?? 0,
    spam_score: row.spam_score ?? 0,
    spam_band: row.spam_band || "",
    etv: row.etv ?? 0,
    organic_count: row.organic_count ?? 0,
    seoScore: row.seoScore ?? 0,
    buyScore: row.buyScore ?? 0,
    verdict: row.verdict || "",
    verdictRank: row.verdictRank ?? 3,
    verdictReason: row.verdictReason || "",
    checkedAt: row.checkedAt || null,
    cached: Boolean(row.cached),
  };
}
