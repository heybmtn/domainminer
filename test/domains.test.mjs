import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDomain, parseDomainList } from "../lib/domains.mjs";

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
