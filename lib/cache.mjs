import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export function createCache(filePath) {
  let data = null;

  async function load() {
    if (data) return data;
    try {
      const raw = await readFile(filePath, "utf8");
      data = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) data = {};
    } catch (err) {
      data = {};
      if (err && err.code !== "ENOENT") {
        console.warn("seo cache unreadable, starting empty:", err.message);
      }
    }
    return data;
  }

  async function persist() {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmp = filePath + ".tmp";
    await writeFile(tmp, JSON.stringify(data, null, 2));
    await rename(tmp, filePath);
  }

  return {
    async get(domain) {
      const store = await load();
      return store[domain] || null;
    },
    async getMany(domains) {
      const store = await load();
      const out = {};
      for (const d of domains) {
        if (store[d]) out[d] = store[d];
      }
      return out;
    },
    async setMany(entries) {
      const store = await load();
      for (const [domain, value] of Object.entries(entries)) {
        store[domain] = value;
      }
      await persist();
    },
    async size() {
      const store = await load();
      return Object.keys(store).length;
    },
  };
}
