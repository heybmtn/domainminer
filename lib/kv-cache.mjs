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
    async size() {
      return 0;
    },
  };
}
