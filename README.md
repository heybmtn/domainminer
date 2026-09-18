# Domain miner

UK Nominet droplist filter for brandable resale hunting, plus an SEO domains queue.

## Run

```bash
cp .env.example .env
# paste login + password from https://app.dataforseo.com/api-access
npm start
```

Open http://localhost:3847

Live: https://domainminer.pages.dev

Nominet filtering works without an API key. **Check SEO** and **Find expiring** stay disabled until `/api/health` reports DataForSEO is configured. On Cloudflare Pages, add `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` as encrypted environment variables for Production and Preview (Settings → Variables and Secrets). Optionally add `DATAFORSEO_MONTHLY_BUDGET` (a USD number) to soft-cap monthly DataForSEO spend — once this month's running total (shown next to Find expiring) reaches it, new paid calls are blocked with a clear error until next month or a higher cap.

## Hunts

1. **Brandables** — today’s Nominet `uk.csv.gz` auto-fetches on load (server-side, cached ~6h) from `droplists.nominet.uk`; **Fetch latest** forces a fresh pull. Presets (Clean brandable, Commercial, All names) apply immediately. Star a name to put it on the Watchlist; **Add to SEO** copies selected names onto the SEO domains list. Scoring here is **Brand score** only (dictionary / invented / `.co.uk` boost). No DataForSEO.
2. **SEO domains** — paste or copy a short list here so you do not spend API on the whole drop file. Check SEO only runs for this list. Already-checked names are skipped; rows missing UK traffic (`organic_count`) get a traffic-only backfill; rows missing KW (`search_volume`) get a volume-only backfill. Scoring here is **SEO score** plus **Verdict** (spam, dofollow Ref, Rank, UK ETV, UK monthly searches for the name). Brand score is shown only when we already know it from Nominet. **Age** (domain registration age) is only known for names found via **Find expiring** — it comes from WHOIS `created_datetime`, not a paid lookup of its own.
3. **Watchlist** — the buy list. Stars from either hunt.

## Tests

```bash
npm test
```
