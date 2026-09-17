# Domain miner

UK Nominet droplist filter for brandable resale hunting, plus an SEO leftovers queue.

## Run

```bash
cp .env.example .env
# paste login + password from https://app.dataforseo.com/api-access
npm start
```

Open http://localhost:3847

Live: https://domainminer.pages.dev

Nominet filtering works without an API key. **Check SEO** and **Find expiring** stay disabled until `/api/health` reports DataForSEO is configured. On Cloudflare Pages, add `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` as encrypted environment variables for Production and Preview (Settings → Variables and Secrets).

## Hunts

1. **Brandables** — load today’s Nominet `uk.csv.gz`. Presets (Clean brandable, Commercial, All names) apply immediately. Star a name to put it on the Watchlist; **Add to SEO** copies selected names onto the leftovers queue.
2. **SEO leftovers** — paste or copy names here so you do not spend API on the whole drop file. Check SEO only runs for this list, and already-checked names are skipped.
3. **Watchlist** — the buy list. Stars from either hunt.

## Tests

```bash
npm test
```
