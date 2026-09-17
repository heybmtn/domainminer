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
