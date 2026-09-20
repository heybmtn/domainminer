import { createServer as createHttpServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCache } from "./lib/cache.mjs";
import { createDataForSeoClient } from "./lib/dataforseo.mjs";
import { enrichDomains, findExpiring, verifyDomains } from "./lib/enrich.mjs";
import { fetchDroplist } from "./lib/nominet.mjs";
import { getSpend, parseBudgetCap } from "./lib/spend.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const INDEX = path.join(ROOT, "index.html");
const DEFAULT_PORT = 3847;
const MAX_BODY = 1_000_000;

export function loadEnvFile(filePath = path.join(ROOT, ".env")) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("Request body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error("Invalid JSON"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function getClient() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    const err = new Error("Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in .env (see .env.example).");
    err.status = 503;
    throw err;
  }
  return createDataForSeoClient({ login, password });
}

function getBudgetCap() {
  return parseBudgetCap(process.env.DATAFORSEO_MONTHLY_BUDGET);
}

export function createServer({ cachePath } = {}) {
  const cache = createCache(cachePath || path.join(ROOT, "data", "seo-cache.json"));

  return createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        const html = await readFile(INDEX);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/health") {
        const spend = await getSpend({ cache });
        json(res, 200, {
          ok: true,
          configured: Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD),
          cacheSize: await cache.size(),
          spend: { ...spend, capUSD: getBudgetCap() },
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/seo/enrich") {
        const body = await readBody(req);
        const result = await enrichDomains(body.domains || [], {
          force: Boolean(body.force),
          cache,
          client: getClient(),
          nameScores: body.nameScores && typeof body.nameScores === "object" ? body.nameScores : {},
          budgetCapUSD: getBudgetCap(),
        });
        json(res, 200, result);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/nominet/droplist") {
        const force = url.searchParams.get("force") === "1";
        const result = await fetchDroplist({ cache, force });
        json(res, 200, result);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/seo/expiring") {
        const body = await readBody(req);
        const result = await findExpiring({
          days: body.days,
          registered: body.registered,
          tld: body.tld,
          minRefDomains: body.minRefDomains,
          minOrganic: body.minOrganic,
          limit: body.limit,
        }, { client: getClient(), cache, budgetCapUSD: getBudgetCap() });
        json(res, 200, result);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/seo/verify") {
        const body = await readBody(req);
        const result = await verifyDomains(body.domains || [], {
          cache,
          client: getClient(),
          budgetCapUSD: getBudgetCap(),
        });
        json(res, 200, result);
        return;
      }

      json(res, 404, { error: "Not found" });
    } catch (err) {
      const status = err.status || 500;
      json(res, status, { error: err.message || "Server error" });
    }
  });
}

if (process.argv[1] && path.basename(process.argv[1]) === "server.mjs") {
  loadEnvFile();
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const server = createServer();
  server.listen(port, () => {
    console.log(`Domain miner on http://localhost:${port}`);
    if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
      console.warn("DataForSEO credentials not set — SEO checks will return 503 until .env is filled in.");
    }
  });
}
