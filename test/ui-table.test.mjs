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
  for (const k of ["rank", "referring_main_domains", "spam_score", "etv", "search_volume"]) {
    assert.match(head, new RegExp(`data-k="${k}" class="num"`), `${k} header must be right-aligned`);
  }
  assert.match(head, /data-k="seoScore"/);
  assert.match(head, /data-k="nameScore"/);
  assert.match(head, /data-k="verdictRank"/);
  assert.doesNotMatch(head, /data-k="seoScore" class="num"/);
  assert.doesNotMatch(head, /data-k="nameScore" class="num"/);
});

test("SEO domain rows attach explainers to each metric cell", () => {
  assert.match(html, /data-tip="'\+seoTip\+'/);
  assert.match(html, /data-tip="'\+brandTip\+'/);
  assert.match(html, /data-tip="'\+COL_TIPS\.rank\+'/);
  assert.match(html, /data-tip="'\+COL_TIPS\.ref\+'/);
  assert.match(html, /data-tip="'\+COL_TIPS\.spam\+'/);
  assert.match(html, /data-tip="'\+COL_TIPS\.etv\+'/);
  assert.match(html, /data-tip="'\+kwCellTip\(r\)\+'/);
  assert.match(html, /data-tip="'\+COL_TIPS\.checked\+'/);
  assert.match(html, /function verdictHtml/);
  assert.match(html, /function scoreBandHtml/);
  assert.match(html, /function scoreBandTip/);
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
  assert.match(html, /hyphens become spaces and glued names split into dictionary words/);
  assert.match(html, /Google Ads exact UK volume/);
  assert.match(html, /Keyword Planner’s grouped estimate/);
  assert.match(html, /UK monthly searches for/);
  assert.match(html, /function kwCellTip/);
  assert.match(html, /prepschools\.co\.uk/);
  assert.doesNotMatch(html, /still ranks for/);
  assert.doesNotMatch(html, /Check SEO does not fill this yet/);
});

test("chrome uses List + filters and SEO Scan, with no black window title bar", () => {
  assert.match(html, />List \+ filters</);
  assert.match(html, />SEO Scan </);
  assert.match(html, /Copy selected names to SEO Scan/);
  assert.match(html, /seo-scan/);
  assert.match(html, /filtersWantOpen/);
  assert.doesNotMatch(html, /id="winname"/);
  assert.doesNotMatch(html, /class="tb"/);
  assert.doesNotMatch(html, />SEO domains </);
  assert.doesNotMatch(html, />Brandables</);
  assert.doesNotMatch(html, /SEO leftovers/);
  assert.doesNotMatch(html, /seo leftovers/);
  assert.doesNotMatch(html, /seo-leftovers/);
});

test("Check SEO backfills rows missing organic_count, search_volume, or a stale keyword phrase", () => {
  assert.match(html, /row\.organic_count == null \|\| row\.organic_count === ""/);
  assert.match(html, /row\.search_volume == null \|\| row\.search_volume === ""/);
  assert.match(html, /row\.keyword \|\| ""\) !== DropCore\.keywordFromDomain\(d\)/);
});

test("SEO score hover explains the formula in plain language", () => {
  assert.match(html, /dofollow Ref \+ Rank/);
  assert.match(html, /UK ETV \+ UK monthly searches/);
  assert.match(html, /Brand score does not change this/);
});

test("Brand and SEO scores render Weak / OK / Strong lights instead of decimals", () => {
  assert.match(html, /function scoreBandHtml/);
  assert.match(html, /scoreBandHtml\(DropCore\.brandBand/);
  assert.match(html, /scoreBandHtml\(DropCore\.seoBand/);
  assert.match(html, /Weak \/ OK \/ Strong/);
  assert.match(html, /Strong is 7\+/);
  assert.match(html, /OK is 3\.5\+/);
  assert.match(html, /Strong is 5\+/);
  assert.match(html, /Weak is negative/);
  assert.match(html, /\.score-band\.strong \.verdict-dot\{background:#2d8a4e\}/);
  assert.match(html, /\.score-band\.ok \.verdict-dot\{background:#c9a227\}/);
  assert.match(html, /\.score-band\.weak \.verdict-dot\{background:#b33\}/);
  assert.match(html, /band\.label\+" \("\+num\+"\)\. "\+explainer/);
  assert.doesNotMatch(html, /Number\(r\.seoScore\|\|0\)\.toFixed\(2\)/);
  assert.doesNotMatch(html, /Number\(r\.nameScore\)\.toFixed\(2\)/);
  assert.doesNotMatch(html, /Number\(r\.score\|\|0\)\.toFixed\(2\)/);
});

test("Verdict is Buy, Research, or Ignore with a traffic-light dot", () => {
  assert.match(html, /verdict==="buy" \? "Buy" : \(r\.verdict==="caution" \? "Research" : "Ignore"\)/);
  assert.match(html, /verdict-dot/);
  assert.match(html, /Buy \(green\), Research \(amber\), or Ignore \(red\)/);
  assert.match(html, /50 spam with links is Research/);
  assert.match(html, /\.verdict\.buy \.verdict-dot\{background:#2d8a4e\}/);
  assert.match(html, /\.verdict\.caution \.verdict-dot\{background:#c9a227\}/);
  assert.match(html, /\.verdict\.skip \.verdict-dot\{background:#b33\}/);
  assert.doesNotMatch(html, />Caution</);
  assert.doesNotMatch(html, /: "Skip"/);
});

test("Time to drop ticks every second with minutes and seconds under an hour", () => {
  assert.match(html, /setInterval\(tickDrop, 1000\)/);
  assert.match(html, /data-drop-ms=/);
  assert.match(html, /function tickDrop/);
  assert.match(html, /m \+ "m " \+ \(s < 10 \? "0" : ""\) \+ s \+ "s"/);
});

test("Watchlist shows Verdict, SEO score, and Brand score", () => {
  const head = grab("FAV_HEAD");
  for (const label of ["Verdict", "SEO score", "Brand score", "Time to drop"]) {
    assert.match(head, new RegExp(`data-tip="[^"]+"[^>]*>${label}`), `${label} needs a data-tip`);
  }
  assert.match(head, /data-k="verdictRank"/);
  assert.match(head, /data-k="seoScore"/);
  assert.match(head, /data-k="score"/);
  assert.match(html, /FAV_COLS = '.*col-verdict.*col-seo.*col-brand/);
  assert.match(html, /favsView \? FAV_COLS/);
  assert.match(html, /favsView \? FAV_HEAD/);
  assert.match(html, /COLS = seo \? 11 : \(favsView \? 9 : 7\)/);
  assert.match(html, /row\.verdict = seo\.verdict/);
  assert.match(html, /row\.seoScore = seo\.seoScore/);
  assert.match(html, /row\.checkedAt = seo\.checkedAt/);
  assert.match(html, /if\(view==="favs"\)\{/);
  assert.match(html, /function toWatchCsv/);
  assert.match(html, /toWatchCsv: toWatchCsv/);
  assert.match(html, /Starred name\. Verdict and SEO score come from Check SEO/);
});
