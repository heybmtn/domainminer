const API_ROOT = "https://api.dataforseo.com";

export function basicAuthHeader(login, password) {
  const raw = `${login}:${password}`;
  if (typeof Buffer !== "undefined") return Buffer.from(raw).toString("base64");
  return btoa(raw);
}

export function readCredentials(env = {}) {
  const login = String(env.DATAFORSEO_LOGIN || "").trim();
  const password = String(env.DATAFORSEO_PASSWORD || "").trim();
  return { login, password, configured: Boolean(login && password) };
}

function throwFromResponse(res, json) {
  const msg = json?.status_message || `DataForSEO HTTP ${res.status}`;
  const err = new Error(msg);
  err.status = res.status === 401 ? 401 : (res.ok ? 502 : res.status);
  err.body = json;
  throw err;
}

export function createDataForSeoClient({
  login,
  password,
  fetchImpl = fetch,
  baseUrl = API_ROOT,
} = {}) {
  if (!login || !password) {
    throw new Error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required");
  }
  const auth = basicAuthHeader(login, password);

  async function request(method, pathname, body) {
    const res = await fetchImpl(`${baseUrl}${pathname}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throwFromResponse(res, json);
    if (json?.status_code && json.status_code !== 20000) throwFromResponse(res, json);
    const taskResult = json?.tasks?.[0];
    if (taskResult && taskResult.status_code && taskResult.status_code !== 20000) {
      const err = new Error(taskResult.status_message || `DataForSEO task ${taskResult.status_code}`);
      err.status = 502;
      err.body = json;
      throw err;
    }
    return json;
  }

  async function get(pathname) {
    return request("GET", pathname);
  }

  async function post(pathname, task) {
    return request("POST", pathname, [task]);
  }

  async function ping() {
    return get("/v3/appendix/user_data");
  }

  return { get, post, ping, login };
}

export function itemsFromTask(json) {
  const task = json?.tasks?.[0];
  const result = task?.result?.[0];
  return {
    items: result?.items || [],
    cost: Number(json?.cost || task?.cost || 0),
    total_count: result?.total_count ?? result?.items_count ?? (result?.items || []).length,
    offset_token: result?.offset_token || null,
  };
}

export function indexByTarget(items) {
  const map = new Map();
  for (const item of items) {
    const key = String(item.target || item.domain || "").toLowerCase().replace(/^www\./, "");
    if (key) map.set(key, item);
  }
  return map;
}
