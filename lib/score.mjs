/** Combine DataForSEO leftover-link metrics with the Nominet name score. */

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function seoScore({
  rank = 0,
  referring_main_domains = 0,
  spam_score = 0,
  etv = 0,
} = {}) {
  const value =
    Math.log1p(Number(referring_main_domains) || 0) +
    (Number(rank) || 0) / 50 -
    (Number(spam_score) || 0) / 5 +
    Math.log1p(Number(etv) || 0);
  return round2(value);
}

export function buyScore(metrics = {}) {
  const seo = seoScore(metrics);
  return round2(seo + (Number(metrics.nameScore) || 0));
}

export function withScores(row) {
  const seo = seoScore(row);
  return {
    ...row,
    seoScore: seo,
    buyScore: round2(seo + (Number(row.nameScore) || 0)),
  };
}
