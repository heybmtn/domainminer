import { test } from "node:test";
import assert from "node:assert/strict";
import {
  brandBand,
  buyScore,
  buyVerdict,
  dofollowMain,
  seoBand,
  seoScore,
  spamBand,
  withScores,
} from "../lib/score.mjs";

test("seoScore rewards referring domains and rank, penalises spam", () => {
  const weak = seoScore({ rank: 0, referring_main_domains: 0, spam_score: 0, etv: 0 });
  const strong = seoScore({ rank: 500, referring_main_domains: 80, spam_score: 0, etv: 100 });
  const spammy = seoScore({ rank: 500, referring_main_domains: 80, spam_score: 80, etv: 100 });
  assert.equal(weak, 0);
  assert.ok(strong > 10);
  assert.ok(spammy < strong);
});

test("seoScore uses dofollow Ref and search volume, not ranking-keyword count", () => {
  const mixed = { referring_main_domains: 20, referring_main_domains_nofollow: 8, rank: 0, spam_score: 0 };
  assert.equal(dofollowMain(mixed), 12);
  const allFollow = seoScore({ ...mixed, referring_main_domains_nofollow: 0 });
  const withNofollow = seoScore(mixed);
  assert.ok(allFollow > withNofollow);

  const noKw = seoScore({ rank: 0, referring_main_domains: 0, etv: 0, organic_count: 40, search_volume: 0 });
  const withKw = seoScore({ rank: 0, referring_main_domains: 0, etv: 0, organic_count: 0, search_volume: 40 });
  assert.equal(noKw, 0);
  assert.ok(withKw > 0);
});

test("buyScore adds the Nominet name score", () => {
  const metrics = { rank: 100, referring_main_domains: 10, spam_score: 10, etv: 0, nameScore: 8 };
  const seo = seoScore(metrics);
  assert.equal(buyScore(metrics), Math.round((seo + 8) * 100) / 100);
  assert.equal(withScores(metrics).buyScore, buyScore(metrics));
  assert.equal(withScores(metrics).seoScore, seo);
});

test("spam 50 is medium and caution when the name has links", () => {
  assert.equal(spamBand(50).label, "med");
  const hint = buyVerdict({
    checkedAt: "2026-09-17T13:00:00.000Z",
    spam_score: 50,
    rank: 42,
    referring_main_domains: 18,
  });
  assert.equal(hint.verdict, "caution");
  assert.equal(hint.spam_band, "med");
  assert.match(hint.reason, /inspect links/i);
});

test("high spam skips even with strong links", () => {
  const hint = buyVerdict({
    checkedAt: "2026-09-17T13:00:00.000Z",
    spam_score: 80,
    rank: 200,
    referring_main_domains: 40,
  });
  assert.equal(hint.verdict, "skip");
  assert.equal(hint.spam_band, "high");
});

test("low spam with referring domains is a buy", () => {
  const hint = buyVerdict({
    checkedAt: "2026-09-17T13:00:00.000Z",
    spam_score: 10,
    rank: 12,
    referring_main_domains: 10,
  });
  assert.equal(hint.verdict, "buy");
  assert.equal(hint.spam_band, "low");
});

test("low spam with UK traffic only is a buy", () => {
  const hint = buyVerdict({
    checkedAt: "2026-09-17T13:00:00.000Z",
    spam_score: 8,
    rank: 0,
    referring_main_domains: 0,
    etv: 12,
    organic_count: 4,
  });
  assert.equal(hint.verdict, "buy");
  assert.match(hint.reason, /traffic/i);
});

test("low spam with search volume only is a buy", () => {
  const hint = buyVerdict({
    checkedAt: "2026-09-17T13:00:00.000Z",
    spam_score: 8,
    rank: 0,
    referring_main_domains: 0,
    etv: 0,
    organic_count: 9,
    search_volume: 12100,
  });
  assert.equal(hint.verdict, "buy");
  assert.match(hint.reason, /search volume/i);
});

test("low spam with no links is a skip", () => {
  const hint = buyVerdict({
    checkedAt: "2026-09-17T13:00:00.000Z",
    spam_score: 10,
    rank: 0,
    referring_main_domains: 0,
  });
  assert.equal(hint.verdict, "skip");
});

test("unchecked rows stay pending", () => {
  const hint = buyVerdict({ spam_score: 50, rank: 80, referring_main_domains: 20 });
  assert.equal(hint.verdict, "");
  assert.equal(hint.verdictRank, 3);
  assert.equal(withScores({ spam_score: 50 }).verdict, "");
});

test("brandBand maps invented ~3.6 to OK and dictionary 8+ to Strong", () => {
  assert.equal(brandBand(3.6).label, "OK");
  assert.equal(brandBand(3.6).key, "ok");
  assert.equal(brandBand(3.5).label, "OK");
  assert.equal(brandBand(3.49).label, "Weak");
  assert.equal(brandBand(8).label, "Strong");
  assert.equal(brandBand(7).label, "Strong");
  assert.equal(brandBand(8.4).key, "strong");
});

test("seoBand maps 10 Strong, 2 OK, and -4 Weak", () => {
  assert.equal(seoBand(10).label, "Strong");
  assert.equal(seoBand(5).label, "Strong");
  assert.equal(seoBand(2).label, "OK");
  assert.equal(seoBand(0).label, "OK");
  assert.equal(seoBand(-4).label, "Weak");
  assert.equal(seoBand(-0.01).key, "weak");
});
