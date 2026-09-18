import { test } from "node:test";
import assert from "node:assert/strict";
import {
  brandBandFromScore,
  judgeBrandabilityBatch,
  stateForDomain,
} from "../lib/jevJudgments.mjs";
import { createJevClient } from "../lib/jev.mjs";

function fakeFetch(handler) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    const result = await handler(body);
    return { ok: true, status: 200, json: async () => result };
  };
}

test("stateForDomain includes domain, words, and tld when present", () => {
  assert.equal(
    stateForDomain({ domain: "lumo.uk", words: "", tld: "uk" }),
    "Domain: lumo.uk\nTLD: .uk",
  );
  assert.equal(
    stateForDomain({ domain: "prepschools.co.uk", words: "prep schools", tld: "co.uk" }),
    "Domain: prepschools.co.uk\nParsed words: prep schools\nTLD: .co.uk",
  );
});

test("brandBandFromScore splits Jev's 0-2 scale into weak/ok/strong", () => {
  assert.equal(brandBandFromScore(0), "weak");
  assert.equal(brandBandFromScore(0.49), "weak");
  assert.equal(brandBandFromScore(0.5), "ok");
  assert.equal(brandBandFromScore(1.49), "ok");
  assert.equal(brandBandFromScore(1.5), "strong");
  assert.equal(brandBandFromScore(2), "strong");
  assert.equal(brandBandFromScore(null), null);
});

test("judgeBrandabilityBatch scores each row and maps to a band", async () => {
  const scores = { "lumo.uk": 1.8, "genericname.uk": 0.2 };
  const fetchImpl = fakeFetch(async (body) => ({
    answers: { brandability: { type: "score", score: scores[body.state.split("\n")[0].slice(8)], confidence: 0.7 } },
    usage: { input_tokens: 50, output_tokens: 5 },
  }));
  const client = createJevClient({ apiKey: "k", fetchImpl });
  const out = await judgeBrandabilityBatch(client, [
    { domain: "lumo.uk", words: "", tld: "uk" },
    { domain: "genericname.uk", words: "generic name", tld: "uk" },
  ]);
  const lumo = out.find((r) => r.domain === "lumo.uk");
  const generic = out.find((r) => r.domain === "genericname.uk");
  assert.equal(lumo.band, "strong");
  assert.equal(lumo.confidence, 0.7);
  assert.equal(generic.band, "weak");
});

test("judgeBrandabilityBatch surfaces a per-row error without failing the whole batch", async () => {
  let calls = 0;
  const fetchImpl = fakeFetch(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error("boom"), { status: 500 });
    return { answers: { brandability: { type: "score", score: 1, confidence: 0.5 } }, usage: { input_tokens: 10, output_tokens: 1 } };
  });
  const client = createJevClient({ apiKey: "k", fetchImpl });
  const out = await judgeBrandabilityBatch(client, [
    { domain: "a.uk", words: "", tld: "uk" },
    { domain: "b.uk", words: "", tld: "uk" },
  ], { concurrency: 1 });
  assert.equal(out.length, 2);
  assert.ok(out[0].error);
  assert.equal(out[1].band, "ok");
});

test("judgeBrandabilityBatch caps at MAX_SHORTLIST_ROWS", async () => {
  const fetchImpl = fakeFetch(async () => ({
    answers: { brandability: { type: "score", score: 1, confidence: 0.5 } },
    usage: { input_tokens: 1, output_tokens: 1 },
  }));
  const client = createJevClient({ apiKey: "k", fetchImpl });
  const rows = Array.from({ length: 5010 }, (_, i) => ({ domain: `d${i}.uk`, words: "", tld: "uk" }));
  const out = await judgeBrandabilityBatch(client, rows, { concurrency: 20 });
  assert.equal(out.length, 5000);
});
