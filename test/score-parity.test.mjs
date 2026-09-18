import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as ServerScore from "../lib/score.mjs";

/**
 * index.html embeds a hand-copied DropCore version of lib/score.mjs so the
 * brandable-name hunt can score instantly without a server round trip. There
 * is no bundler wiring the two together, so this test is the tripwire: it
 * runs both copies against the same fixtures and fails loudly the moment
 * they disagree, instead of letting the client and server silently drift.
 */
function loadDropCore() {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const start = html.indexOf("/* core.js");
  const end = html.indexOf("</script>", start);
  assert.ok(start >= 0 && end > start, "DropCore script not found");
  const code = html.slice(html.lastIndexOf("<script>", start), end).replace(/^<script>/, "");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.DropCore;
}

const DropCore = loadDropCore();

const FIXTURES = [
  { rank: 0, referring_main_domains: 0, spam_score: 0, etv: 0 },
  { rank: 500, referring_main_domains: 80, spam_score: 0, etv: 100 },
  { rank: 500, referring_main_domains: 80, spam_score: 80, etv: 100 },
  { rank: 12, referring_main_domains: 10, referring_main_domains_nofollow: 0, spam_score: 10, checkedAt: "x" },
  { rank: 0, referring_main_domains: 20, referring_main_domains_nofollow: 20, spam_score: 10, checkedAt: "x" },
  { rank: 0, referring_main_domains: 0, spam_score: 8, etv: 0, search_volume: 99, checkedAt: "x" },
  { rank: 0, referring_main_domains: 0, spam_score: 8, etv: 0, search_volume: 100, checkedAt: "x" },
  { rank: 42, referring_main_domains: 18, spam_score: 50, checkedAt: "x" },
  { rank: 200, referring_main_domains: 40, spam_score: 80, checkedAt: "x" },
  { rank: 12, referring_main_domains: 10, spam_score: 10, nameScore: 8, checkedAt: "x" },
  { rank: 12, referring_main_domains: 10, spam_score: 10, nameScore: 2, checkedAt: "x" },
];

test("DropCore (index.html) and lib/score.mjs agree on seoScore/buyScore for every fixture", () => {
  for (const m of FIXTURES) {
    assert.equal(DropCore.seoScore(m), ServerScore.seoScore(m), `seoScore drifted for ${JSON.stringify(m)}`);
    assert.equal(DropCore.buyScore(m), ServerScore.buyScore(m), `buyScore drifted for ${JSON.stringify(m)}`);
  }
});

test("DropCore and lib/score.mjs agree on buyVerdict for every fixture", () => {
  for (const m of FIXTURES) {
    const client = DropCore.buyVerdict(m);
    const server = ServerScore.buyVerdict(m);
    assert.equal(client.verdict, server.verdict, `verdict drifted for ${JSON.stringify(m)}`);
    assert.equal(client.verdictRank, server.verdictRank, `verdictRank drifted for ${JSON.stringify(m)}`);
    assert.equal(client.spam_band, server.spam_band, `spam_band drifted for ${JSON.stringify(m)}`);
    assert.equal(client.reason, server.reason, `reason drifted for ${JSON.stringify(m)}`);
  }
});

test("DropCore and lib/score.mjs agree on brandBand/seoBand thresholds", () => {
  // Compare fields, not whole objects: DropCore's plain objects come from a
  // separate vm realm, so a strict deepEqual would fail on prototype alone.
  for (const n of [-4, -0.01, 0, 2, 3.49, 3.5, 3.6, 5, 7, 7.01, 8, 10]) {
    const clientBrand = DropCore.brandBand(n);
    const serverBrand = ServerScore.brandBand(n);
    assert.equal(clientBrand.key, serverBrand.key, `brandBand.key drifted for ${n}`);
    assert.equal(clientBrand.label, serverBrand.label, `brandBand.label drifted for ${n}`);
    const clientSeo = DropCore.seoBand(n);
    const serverSeo = ServerScore.seoBand(n);
    assert.equal(clientSeo.key, serverSeo.key, `seoBand.key drifted for ${n}`);
    assert.equal(clientSeo.label, serverSeo.label, `seoBand.label drifted for ${n}`);
  }
});
