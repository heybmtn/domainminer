/** SEO domains: DataForSEO metrics only. Brandables keep Nominet Brand score. */

export function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Referring-main-domain floor used by the SEO hunt. */
export const MIN_REF_LINKS = 5;
/** Rank that counts as link equity even if Ref is thin. */
export const MIN_RANK_LINKS = 40;

export function dofollowMain({
  referring_main_domains = 0,
  referring_main_domains_nofollow = 0,
} = {}) {
  const ref = Number(referring_main_domains) || 0;
  const nof = Number(referring_main_domains_nofollow) || 0;
  return Math.max(0, ref - nof);
}

export function hasTraffic({ etv = 0, organic_count = 0 } = {}) {
  return (Number(etv) || 0) > 0 || (Number(organic_count) || 0) > 0;
}

export function seoScore(m = {}) {
  const value =
    Math.log1p(dofollowMain(m)) +
    (Number(m.rank) || 0) / 50 -
    (Number(m.spam_score) || 0) / 5 +
    Math.log1p(Number(m.etv) || 0) +
    Math.log1p(Number(m.organic_count) || 0);
  return round2(value);
}

export function buyScore(metrics = {}) {
  const seo = seoScore(metrics);
  return round2(seo + (Number(metrics.nameScore) || 0));
}

/** DataForSEO spam is 0–100. Higher is worse. 0–30 low, 31–60 medium, 61–100 high. */
export function spamBand(spam_score) {
  const n = Number(spam_score);
  if (!Number.isFinite(n)) return { key: "", label: "" };
  if (n >= 61) return { key: "high", label: "high" };
  if (n >= 31) return { key: "med", label: "med" };
  return { key: "low", label: "low" };
}

export function hasMeaningfulLinks({ rank = 0, referring_main_domains = 0 } = {}) {
  return (Number(referring_main_domains) || 0) >= MIN_REF_LINKS
    || (Number(rank) || 0) >= MIN_RANK_LINKS;
}

/**
 * Row-level register hint for SEO domains. Unchecked rows stay pending.
 * Brand score does not change this. 50 with links is caution, not buy.
 */
export function buyVerdict(row = {}) {
  if (!row.checkedAt) {
    return {
      verdict: "",
      verdictRank: 3,
      spam_band: "",
      reason: "Check SEO first.",
    };
  }
  const spam = Number(row.spam_score) || 0;
  const band = spamBand(spam);
  const links = hasMeaningfulLinks(row);
  const traffic = hasTraffic(row);

  if (spam >= 61) {
    return {
      verdict: "skip",
      verdictRank: 2,
      spam_band: band.key,
      reason: "High spam (61-100). Skip — toxic equity, do not register.",
    };
  }
  if (!links && !traffic) {
    return {
      verdict: "skip",
      verdictRank: 2,
      spam_band: band.key,
      reason: "No meaningful Rank, Ref, or UK traffic. Skip — nothing to buy for SEO.",
    };
  }
  if (spam >= 31) {
    return {
      verdict: "caution",
      verdictRank: 1,
      spam_band: band.key,
      reason: "Medium spam (31-60). Caution — inspect links before you register.",
    };
  }
  if (links && traffic) {
    return {
      verdict: "buy",
      verdictRank: 0,
      spam_band: band.key,
      reason: "Low spam with Rank/Ref and UK traffic. Buy.",
    };
  }
  if (traffic) {
    return {
      verdict: "buy",
      verdictRank: 0,
      spam_band: band.key,
      reason: "Low spam with UK organic traffic. Buy.",
    };
  }
  return {
    verdict: "buy",
    verdictRank: 0,
    spam_band: band.key,
    reason: "Low spam (0-30) with Rank or Ref. Buy.",
  };
}

export function withScores(row) {
  const seo = seoScore(row);
  const hint = buyVerdict(row);
  return {
    ...row,
    dofollow_main: dofollowMain(row),
    seoScore: seo,
    buyScore: round2(seo + (Number(row.nameScore) || 0)),
    spam_band: hint.spam_band,
    verdict: hint.verdict,
    verdictRank: hint.verdictRank,
    verdictReason: hint.reason,
  };
}
