/** SEO domains: DataForSEO metrics only. Brandables keep Nominet Brand score. */

export function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Referring-main-domain floor used by the SEO hunt. Counts dofollow only. */
export const MIN_REF_LINKS = 5;
/** Rank that counts as link equity even if Ref is thin. */
export const MIN_RANK_LINKS = 40;
/** Search volume alone (no organic traffic yet) needs this many UK monthly searches to count. */
export const MIN_SEARCH_VOLUME_ONLY = 100;

/** Thresholds brandBand/seoBand call "Strong". Used to put nameScore on the same scale as seoScore. */
const BRAND_STRONG = 7;
const SEO_STRONG = 5;

export function dofollowMain({
  referring_main_domains = 0,
  referring_main_domains_nofollow = 0,
} = {}) {
  const ref = Number(referring_main_domains) || 0;
  const nof = Number(referring_main_domains_nofollow) || 0;
  return Math.max(0, ref - nof);
}

/**
 * Organic traffic (etv > 0) is real, so any amount counts. Search volume alone
 * is just keyword demand — the domain isn't proven to rank for it — so it
 * needs to clear MIN_SEARCH_VOLUME_ONLY before it counts as traffic.
 */
export function hasTraffic({ etv = 0, search_volume = 0 } = {}) {
  return (Number(etv) || 0) > 0 || (Number(search_volume) || 0) >= MIN_SEARCH_VOLUME_ONLY;
}

export function seoScore(m = {}) {
  const value =
    Math.log1p(dofollowMain(m)) +
    (Number(m.rank) || 0) / 50 -
    (Number(m.spam_score) || 0) / 5 +
    Math.log1p(Number(m.etv) || 0) +
    Math.log1p(Number(m.search_volume) || 0);
  return round2(value);
}

/** Nominet Brand score put on the same scale as seoScore (their "Strong" thresholds line up). */
export function normalizedBrand(nameScore) {
  const n = Number(nameScore);
  if (!Number.isFinite(n)) return 0;
  return n * (SEO_STRONG / BRAND_STRONG);
}

export function buyScore(metrics = {}) {
  const seo = seoScore(metrics);
  return round2(seo + normalizedBrand(metrics.nameScore));
}

/** DataForSEO spam is 0–100. Higher is worse. 0–30 low, 31–60 medium, 61–100 high. */
export function spamBand(spam_score) {
  const n = Number(spam_score);
  if (!Number.isFinite(n)) return { key: "", label: "" };
  if (n >= 61) return { key: "high", label: "high" };
  if (n >= 31) return { key: "med", label: "med" };
  return { key: "low", label: "low" };
}

/** Nominet Brand score: dictionary/commercial names ~8, invented 4–8 letter ~3.6. */
export function brandBand(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return { key: "", label: "" };
  if (n >= BRAND_STRONG) return { key: "strong", label: "Strong" };
  if (n >= 3.5) return { key: "ok", label: "OK" };
  return { key: "weak", label: "Weak" };
}

/** SEO score is unbounded: buyme ~10.4, researchme ~2.0, ignoreme ~-4. */
export function seoBand(seoScore) {
  const n = Number(seoScore);
  if (!Number.isFinite(n)) return { key: "", label: "" };
  if (n >= SEO_STRONG) return { key: "strong", label: "Strong" };
  if (n >= 0) return { key: "ok", label: "OK" };
  return { key: "weak", label: "Weak" };
}

/** Only dofollow links count as link equity — matches the dofollow-only signal in seoScore. */
export function hasMeaningfulLinks(row = {}) {
  return dofollowMain(row) >= MIN_REF_LINKS
    || (Number(row.rank) || 0) >= MIN_RANK_LINKS;
}

function brandCaveat(row) {
  if (row.nameScore == null || row.nameScore === "") return "";
  const band = brandBand(row.nameScore).key;
  if (band === "weak") return " Brand name is weak — this is an SEO-only buy, not a name you'd want to keep.";
  if (band === "strong") return " Brand name is strong — worth a look for the name alone too.";
  return "";
}

/**
 * Row-level register hint for SEO domains. Unchecked rows stay pending.
 * Driven by spam, dofollow Rank/Ref, UK traffic, and search volume; the reason
 * gets a brand-quality caveat appended when nameScore has been assessed.
 * 50 with links is caution, not buy.
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

  let result;
  if (spam >= 61) {
    result = {
      verdict: "skip",
      verdictRank: 2,
      spam_band: band.key,
      reason: "High spam (61-100). Skip — toxic equity, do not register.",
    };
  } else if (!links && !traffic) {
    result = {
      verdict: "skip",
      verdictRank: 2,
      spam_band: band.key,
      reason: "No meaningful dofollow Rank, Ref, UK traffic, or search volume. Skip — nothing to buy for SEO.",
    };
  } else if (spam >= 31) {
    result = {
      verdict: "caution",
      verdictRank: 1,
      spam_band: band.key,
      reason: "Medium spam (31-60). Caution — inspect links before you register.",
    };
  } else if (links && traffic) {
    result = {
      verdict: "buy",
      verdictRank: 0,
      spam_band: band.key,
      reason: "Low spam with dofollow Rank/Ref and UK traffic or search volume. Buy.",
    };
  } else if (traffic) {
    const etv = (Number(row.etv) || 0) > 0;
    result = {
      verdict: "buy",
      verdictRank: 0,
      spam_band: band.key,
      reason: etv
        ? "Low spam with UK organic traffic. Buy."
        : `Low spam with UK search volume (${MIN_SEARCH_VOLUME_ONLY}+/mo). Buy.`,
    };
  } else {
    result = {
      verdict: "buy",
      verdictRank: 0,
      spam_band: band.key,
      reason: "Low spam (0-30) with dofollow Rank or Ref. Buy.",
    };
  }
  result.reason += brandCaveat(row);
  return result;
}

export function withScores(row) {
  const seo = seoScore(row);
  const hint = buyVerdict(row);
  return {
    ...row,
    dofollow_main: dofollowMain(row),
    seoScore: seo,
    buyScore: round2(seo + normalizedBrand(row.nameScore)),
    spam_band: hint.spam_band,
    verdict: hint.verdict,
    verdictRank: hint.verdictRank,
    verdictReason: hint.reason,
  };
}
