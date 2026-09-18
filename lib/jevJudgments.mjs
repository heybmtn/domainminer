import { batchAsk } from "./jev.mjs";

const MAX_SHORTLIST_ROWS = 5000;

export function brandabilityQuestion() {
  return {
    type: "score",
    instructions: "How strong is this as a resellable UK brand name — short, memorable, and easy to say and spell as a standalone brand (not judged as a description of a business)?",
    criteria: [
      "Weak: generic, hard to say or spell, or reads as a keyword string rather than a name",
      "OK: usable as a name but not especially distinctive or memorable",
      "Strong: short, memorable, easy to say and spell — could work as a real brand",
    ],
  };
}

export function stateForDomain({ domain, words, tld } = {}) {
  const lines = [`Domain: ${domain}`];
  if (words) lines.push(`Parsed words: ${words}`);
  if (tld) lines.push(`TLD: .${tld}`);
  return lines.join("\n");
}

/** Jev's score type returns a continuous value across the 3 given levels (0=Weak, 1=OK, 2=Strong). */
export function brandBandFromScore(score) {
  if (score == null || !Number.isFinite(score)) return null;
  if (score >= 1.5) return "strong";
  if (score >= 0.5) return "ok";
  return "weak";
}

/**
 * Scores brandability for many droplist rows in one batch. Capped at
 * MAX_SHORTLIST_ROWS so an oversized droplist can't turn into an unbounded
 * number of paid calls from a single request.
 */
export async function judgeBrandabilityBatch(client, rows, opts = {}) {
  const capped = (rows || []).slice(0, MAX_SHORTLIST_ROWS);
  const question = brandabilityQuestion();
  const items = capped.map((r) => ({
    state: stateForDomain(r),
    questions: { brandability: question },
  }));
  const results = await batchAsk(client, items, opts);
  return capped.map((r, i) => {
    const res = results[i];
    if (res.error) {
      return { domain: r.domain, error: res.error, status: res.status };
    }
    const a = res.answers.brandability || {};
    return {
      domain: r.domain,
      score: a.score ?? null,
      confidence: a.confidence ?? null,
      band: brandBandFromScore(a.score),
      cost: res.cost || 0,
      cached: res.cached,
    };
  });
}

export { MAX_SHORTLIST_ROWS };
