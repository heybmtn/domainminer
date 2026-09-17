import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

function grab(name) {
  const re = new RegExp(`const ${name} = ([\\s\\S]*?);\\n`);
  const m = html.match(re);
  assert.ok(m, `missing ${name}`);
  return m[1];
}

test("SEO domain headers are numeric and have hover explainers", () => {
  const head = grab("SEO_HEAD");
  for (const label of ["Verdict", "SEO score", "Brand score", "Rank", "Ref", "Spam", "ETV", "KW", "Checked"]) {
    assert.match(head, new RegExp(`data-tip="[^"]+"[^>]*>${label}`), `${label} needs a data-tip`);
  }
  for (const k of ["seoScore", "nameScore", "rank", "referring_main_domains", "spam_score", "etv", "search_volume"]) {
    assert.match(head, new RegExp(`data-k="${k}" class="num"`), `${k} header must be right-aligned`);
  }
  assert.match(head, /data-k="verdictRank"/);
});

test("SEO domain rows attach explainers to each metric cell", () => {
  assert.match(html, /data-tip="'\+COL_TIPS\.seo\+'/);
  assert.match(html, /data-tip="'\+COL_TIPS\.brand\+'/);
  assert.match(html, /data-tip="'\+COL_TIPS\.rank\+'/);
  assert.match(html, /data-tip="'\+COL_TIPS\.ref\+'/);
  assert.match(html, /data-tip="'\+COL_TIPS\.spam\+'/);
  assert.match(html, /data-tip="'\+COL_TIPS\.etv\+'/);
  assert.match(html, /data-tip="'\+COL_TIPS\.kw\+'/);
  assert.match(html, /data-tip="'\+COL_TIPS\.checked\+'/);
  assert.match(html, /function verdictHtml/);
  assert.match(html, /function fmtSpam/);
});

test("fixed layout gives Brand score and SEO score their own column widths", () => {
  assert.match(html, /table\{table-layout:fixed/);
  assert.match(html, /col\.col-brand\{width:8\.8rem\}/);
  assert.match(html, /col\.col-seo\{width:7\.6rem\}/);
  assert.match(html, /thead th\.num, td\.num\{text-align:right/);
  assert.match(html, /SEO_COLS = '.*col-verdict.*col-seo.*col-brand.*col-num.*col-num.*col-spam.*col-num.*col-kw.*col-when/);
});

test("Spam hover explains 0-100 bands and that 50 is medium", () => {
  assert.match(html, /Spam is 0-100 from DataForSEO/);
  assert.match(html, /50 is medium/);
});

test("ETV and KW hovers describe UK traffic and monthly searches", () => {
  assert.match(html, /ETV: estimated UK organic clicks/);
  assert.match(html, /KW: UK monthly searches for this name as a keyword/);
  assert.match(html, /prep-schools\.co\.uk/);
  assert.doesNotMatch(html, /still ranks for/);
  assert.doesNotMatch(html, /Check SEO does not fill this yet/);
});

test("user-facing copy says SEO domains, not leftovers", () => {
  assert.match(html, />SEO domains </);
  assert.match(html, /Copy selected names to SEO domains/);
  assert.match(html, /seo-domains/);
  assert.doesNotMatch(html, /SEO leftovers/);
  assert.doesNotMatch(html, /seo leftovers/);
  assert.doesNotMatch(html, /seo-leftovers/);
});

test("Check SEO backfills rows missing organic_count or search_volume", () => {
  assert.match(html, /row\.organic_count == null \|\| row\.organic_count === ""/);
  assert.match(html, /row\.search_volume == null \|\| row\.search_volume === ""/);
});
