export function createKvCache(namespace) {
  if (!namespace) {
    return {
      async getMany() { return {}; },
      async setMany() {},
      async size() { return 0; },
    };
  }

  const keyFor = (domain) => `seo:${domain}`;

  return {
    async getMany(domains) {
      const out = {};
      await Promise.all(domains.map(async (domain) => {
        const raw = await namespace.get(keyFor(domain));
        if (!raw) return;
        try { out[domain] = JSON.parse(raw); }
        catch { /* ignore corrupt entries */ }
      }));
      return out;
    },
    async setMany(entries) {
      await Promise.all(Object.entries(entries).map(([domain, value]) => (
        namespace.put(keyFor(domain), JSON.stringify(value))
      )));
    },
    /** Counts cached SEO entries via KV list(). Capped at MAX_PAGES so a huge cache stays cheap to check. */
    async size() {
      const MAX_PAGES = 5;
      let count = 0;
      let cursor;
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await namespace.list({ prefix: "seo:", cursor });
        count += result.keys.length;
        if (result.list_complete || !result.cursor) return count;
        cursor = result.cursor;
      }
      return count;
    },
  };
}
