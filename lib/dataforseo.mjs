const API_ROOT = "https://api.dataforseo.com";

export function createDataForSeoClient({
  login,
  password,
  fetchImpl = fetch,
  baseUrl = API_ROOT,
} = {}) {
  if (!login || !password) {
    throw new Error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required");
  }
  const auth = Buffer.from(`${login}:${password}`).toString("base64");

  async function post(pathname, task) {
    const res = await fetchImpl(`${baseUrl}${pathname}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([task]),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json?.status_message || `DataForSEO HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    if (json?.status_code && json.status_code !== 20000) {
      const err = new Error(json.status_message || `DataForSEO status ${json.status_code}`);
      err.status = 502;
      err.body = json;
      throw err;
    }
    const taskResult = json?.tasks?.[0];
    if (taskResult && taskResult.status_code && taskResult.status_code !== 20000) {
      const err = new Error(taskResult.status_message || `DataForSEO task ${taskResult.status_code}`);
      err.status = 502;
      err.body = json;
      throw err;
    }
    return json;
  }

  return { post, login };
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
