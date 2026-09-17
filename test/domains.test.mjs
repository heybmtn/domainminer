import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { keywordFromDomain, normalizeDomain, parseDomainList } from "../lib/domains.mjs";
import { WORDS } from "../lib/words.mjs";

test("normalizeDomain strips urls and www", () => {
  assert.equal(normalizeDomain("HTTPS://WWW.Example.co.uk/path"), "example.co.uk");
  assert.equal(normalizeDomain(" foo.com. "), "foo.com");
  assert.equal(normalizeDomain("not a domain"), null);
  assert.equal(normalizeDomain(".uk"), null);
});

test("parseDomainList dedupes and caps", () => {
  const list = parseDomainList("a.com, A.com\nb.co.uk;https://www.c.uk/x", { limit: 10 });
  assert.deepEqual(list, ["a.com", "b.co.uk", "c.uk"]);
});

test("keywordFromDomain turns hyphens and glued dictionary words into a UK search phrase", () => {
  assert.equal(keywordFromDomain("prep-schools.co.uk"), "prep schools");
  assert.equal(keywordFromDomain("HTTPS://WWW.Prep-Schools.co.uk"), "prep schools");
  assert.equal(keywordFromDomain("prepschools.co.uk"), "prep schools");
  assert.equal(keywordFromDomain("lumo.uk"), "lumo");
});

test("server vocab matches the Brand WORDS list in index.html", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const m = html.match(/const WORDS = "([^"]+)"/);
  assert.ok(m, "index.html WORDS missing");
  assert.equal(WORDS, m[1]);
});
