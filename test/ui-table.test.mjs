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

test("SEO leftover headers are numeric and have hover explainers", () => {
  const head = grab("SEO_HEAD");
  for (const label of ["Brand score", "Rank", "Ref", "Spam", "ETV", "Checked"]) {
    assert.match(head, new RegExp(`data-tip="[^"]+"[^>]*>${label}`), `${label} needs a data-tip`);
  }
  for (const k of ["nameScore", "rank", "referring_main_domains", "spam_score", "etv"]) {
    assert.match(head, new RegExp(`data-k="${k}" class="num"`), `${k} header must be right-aligned`);
  }
});

test("SEO leftover rows attach explainers to each metric cell", () => {
  assert.match(html, /data-tip="'\+COL_TIPS\.brand\+'"/);
  assert.match(html, /data-tip="'\+COL_TIPS\.rank\+'"/);
  assert.match(html, /data-tip="'\+COL_TIPS\.ref\+'"/);
  assert.match(html, /data-tip="'\+COL_TIPS\.spam\+'"/);
  assert.match(html, /data-tip="'\+COL_TIPS\.etv\+'"/);
  assert.match(html, /data-tip="'\+COL_TIPS\.checked\+'"/);
});

test("fixed layout gives Brand score its own column width", () => {
  assert.match(html, /table\{table-layout:fixed/);
  assert.match(html, /col\.col-brand\{width:8\.8rem\}/);
  assert.match(html, /thead th\.num, td\.num\{text-align:right/);
  assert.match(html, /SEO_COLS = '.*col-brand.*col-num.*col-num.*col-num.*col-num.*col-when/);
});
