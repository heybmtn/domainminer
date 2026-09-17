import { test } from "node:test";
import assert from "node:assert/strict";
import { buyScore, seoScore, withScores } from "../lib/score.mjs";

test("seoScore rewards referring domains and rank, penalises spam", () => {
  const weak = seoScore({ rank: 0, referring_main_domains: 0, spam_score: 0, etv: 0 });
  const strong = seoScore({ rank: 500, referring_main_domains: 80, spam_score: 0, etv: 100 });
  const spammy = seoScore({ rank: 500, referring_main_domains: 80, spam_score: 80, etv: 100 });
  assert.equal(weak, 0);
  assert.ok(strong > 10);
  assert.ok(spammy < strong);
});

test("buyScore adds the Nominet name score", () => {
  const metrics = { rank: 100, referring_main_domains: 10, spam_score: 10, etv: 0, nameScore: 8 };
  const seo = seoScore(metrics);
  assert.equal(buyScore(metrics), Math.round((seo + 8) * 100) / 100);
  assert.equal(withScores(metrics).buyScore, buyScore(metrics));
});
