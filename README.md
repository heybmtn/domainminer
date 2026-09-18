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

Nominet filtering works without an API key. **Check SEO** and **Find expiring** stay disabled until `/api/health` reports DataForSEO is configured **and authorized**. On Cloudflare Pages, add `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` as encrypted environment variables for Production and Preview (Settings → Variables and Secrets). Use the API login and API password from https://app.dataforseo.com/api-access, not the dashboard password. After changing secrets, retry the latest production deployment. Health should then show `"authorized": true`.

## Hunts

1. **Brandables** — load today’s Nominet `uk.csv.gz`. Presets (Clean brandable, Commercial, All names) apply immediately. Star a name to put it on the Watchlist; **Add to SEO** copies selected names onto the SEO domains list. Scoring here is **Brand score** only (dictionary / invented / `.co.uk` boost). No DataForSEO.
2. **SEO domains** — paste or copy a short list here so you do not spend API on the whole drop file. Check SEO only runs for this list. Already-checked names are skipped; rows missing UK traffic (`organic_count`) get a traffic-only backfill; rows missing KW (`search_volume`) get a volume-only backfill. Scoring here is **SEO score** plus **Verdict** (spam, dofollow Ref, Rank, UK ETV, UK monthly searches for the name). Brand score is shown only when we already know it from Nominet.
3. **Watchlist** — the buy list. Stars from either hunt.

## Tests

```bash
npm test
```
