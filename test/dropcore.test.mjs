import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

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
const words = ["home", "bright", "insurance", "london", "plumber"];
const V = DropCore.buildVocab(words);
const N = V.size;

test("invented brandables get a modest score and invented tag", () => {
  const lumo = DropCore.makeCandidate("lumo.uk", "", V, N, 3);
  assert.equal(lumo.isWords, false);
  assert.equal(lumo.invented, true);
  assert.equal(lumo.words, "");
  assert.ok(lumo.score > 0);
  const home = DropCore.makeCandidate("home.uk", "", V, N, 3);
  assert.equal(home.isWords, true);
  assert.equal(home.invented, false);
  assert.ok(home.score > lumo.score);
});

test("brandBand maps invented names to OK and home-class names to Strong", () => {
  const lumo = DropCore.makeCandidate("lumo.uk", "", V, N, 3);
  assert.ok(lumo.score >= 3.5 && lumo.score < 7);
  assert.equal(DropCore.brandBand(lumo.score).label, "OK");
  const home = DropCore.makeCandidate("home.co.uk", "", V, N, 3);
  assert.ok(home.score >= 8);
  assert.equal(DropCore.brandBand(home.score).label, "Strong");
  assert.equal(DropCore.seoBand(10).label, "Strong");
  assert.equal(DropCore.seoBand(2).label, "OK");
  assert.equal(DropCore.seoBand(-4).label, "Weak");
});

test(".co.uk gets a small boost over the matching .uk name", () => {
  const uk = DropCore.makeCandidate("lumo.uk", "", V, N, 3);
  const co = DropCore.makeCandidate("lumo.co.uk", "", V, N, 3);
  assert.equal(uk.invented, true);
  assert.equal(co.invented, true);
  assert.ok(co.score > uk.score);
  assert.equal(Math.round((co.score - uk.score) * 100) / 100, 0.3);
});

test("hyphens, digits, and short labels are not invented brandables", () => {
  assert.equal(DropCore.makeCandidate("lum-o.uk", "", V, N, 3).invented, false);
  assert.equal(DropCore.makeCandidate("lumo2.uk", "", V, N, 3).invented, false);
  assert.equal(DropCore.makeCandidate("xyz.uk", "", V, N, 3).invented, false);
});

test("clean 1–2 word filter still includes invented names", () => {
  const rows = [
    DropCore.makeCandidate("lumo.uk", "", V, N, 3),
    DropCore.makeCandidate("home.uk", "", V, N, 3),
    DropCore.makeCandidate("zzzzzzzz.uk", "", V, N, 3)
  ];
  const out = DropCore.applyFilters(rows, {
    tlds: new Set(["uk", "co.uk"]),
    wordCounts: new Set([1, 2]),
    excludeNumbers: true,
    excludeHyphens: true
  });
  const domains = out.map((r) => r.domain);
  assert.ok(domains.includes("lumo.uk"));
  assert.ok(domains.includes("home.uk"));
  assert.ok(!domains.includes("zzzzzzzz.uk"));
});

test("keywordFromDomain splits glued dictionary words when vocab is set", () => {
  const vocab = DropCore.buildVocab(["prep", "schools", "home"]);
  DropCore.setKeywordVocab(vocab);
  assert.equal(DropCore.keywordFromDomain("prepschools.co.uk"), "prep schools");
  assert.equal(DropCore.keywordFromDomain("prep-schools.co.uk"), "prep schools");
  assert.equal(DropCore.keywordFromDomain("lumo.uk"), "lumo");
});

test("buildVocab splits a WORDS string into dictionary entries", () => {
  const vocab = DropCore.buildVocab("home bright insurance");
  assert.equal(vocab.size, 3);
  assert.equal(vocab.get("home"), 0);
  assert.equal(vocab.get("h"), undefined);
});

test("production WORDS vocab treats home.co.uk as a dictionary name", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const m = html.match(/const WORDS = "([^"]+)"/);
  assert.ok(m, "index.html WORDS missing");
  const vocab = DropCore.buildVocab(m[1]);
  assert.ok(vocab.size > 100);
  const home = DropCore.makeCandidate("home.co.uk", "", vocab, vocab.size, 3);
  assert.equal(home.words, "home");
  assert.equal(home.invented, false);
  assert.equal(home.isWords, true);
});

test("fmtDur shows minutes and seconds under one hour", () => {
  assert.equal(DropCore.fmtDur(3 * 864e5 + 5 * 36e5), "3d 5h");
  assert.equal(DropCore.fmtDur(5 * 36e5 + 12 * 6e4), "5h 12m");
  assert.equal(DropCore.fmtDur(12 * 6e4 + 4 * 1000), "12m 04s");
  assert.equal(DropCore.fmtDur(18 * 1000), "18s");
  assert.equal(DropCore.fmtDur(0), "dropped");
  assert.equal(DropCore.fmtDur(-1000), "dropped");
});
