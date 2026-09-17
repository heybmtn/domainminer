# Domain miner

UK Nominet droplist filter plus a DataForSEO-backed SEO watchlist.

## Run

```bash
cp .env.example .env
# paste login + password from https://app.dataforseo.com/api-access
npm start
```

Open http://localhost:3847

Nominet filtering works without an API key. **Check SEO** and **Find expiring** need `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD`.

## SEO list

1. Add names (paste, or **Add selected** from the shortlist).
2. **Check SEO** looks up rank, referring domains, and spam for names not already in the cache.
3. Results are stored in `data/seo-cache.json`. The same domain is not billed again unless you **Recheck selected**.

## Tests

```bash
npm test
```
