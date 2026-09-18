export function round2(n) {
  return Math.round(n * 100) / 100;
}

function monthId(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** service e.g. "dataforseo" or "jev" — each tracked (and capped) independently. */
function spendKey(service, date) {
  return `spend-${service}-${monthId(date)}`;
}

/** Adds a completed call's cost to this UTC month's running total for that service. No-ops for a zero/negative amount or no cache. */
export async function recordSpend({ cache, service, amount, now = () => new Date() } = {}) {
  const amt = Number(amount) || 0;
  if (!cache || amt <= 0) return;
  const key = spendKey(service, now());
  const found = await cache.getMany([key]);
  const total = round2((Number(found[key]) || 0) + amt);
  await cache.setMany({ [key]: total });
}

/** Current UTC month's running spend total for one service. */
export async function getSpend({ cache, service, now = () => new Date() } = {}) {
  const date = now();
  const month = monthId(date);
  if (!cache) return { month, total: 0 };
  const key = spendKey(service, date);
  const found = await cache.getMany([key]);
  return { month, total: Number(found[key]) || 0 };
}

/** capUSD is optional (from *_MONTHLY_BUDGET); null/unset means no cap enforced. */
export function checkBudget({ total, capUSD }) {
  if (capUSD == null || !Number.isFinite(capUSD) || capUSD <= 0) {
    return { capUSD: null, exceeded: false };
  }
  return { capUSD, exceeded: total >= capUSD };
}

export function parseBudgetCap(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
