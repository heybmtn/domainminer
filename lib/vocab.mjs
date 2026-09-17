import { WORDS } from "./words.mjs";

export function buildVocab(words) {
  const v = new Map();
  const list = Array.isArray(words) ? words : String(words || "").split(" ").filter(Boolean);
  for (let i = 0; i < list.length; i++) v.set(list[i], i);
  return v;
}

export const VOCAB = buildVocab(WORDS);

/** Same 2–3 word splitter as DropCore.segment. */
export function segment(label, V, maxWords) {
  const n = label.length;
  if (V.has(label)) return [label];
  let best = null;
  let bestKey = Infinity;
  for (let i = 1; i < n; i++) {
    const a = label.slice(0, i);
    const b = label.slice(i);
    const ra = V.get(a);
    if (ra === undefined) continue;
    const rb = V.get(b);
    if (rb === undefined) continue;
    const key = Math.max(ra, rb);
    if (key < bestKey) {
      bestKey = key;
      best = [a, b];
    }
  }
  if (best) return best;
  if (maxWords < 3) return null;
  for (let i = 1; i < n - 1; i++) {
    const a1 = label.slice(0, i);
    const r1 = V.get(a1);
    if (r1 === undefined) continue;
    for (let j = i + 1; j < n; j++) {
      const b1 = label.slice(i, j);
      const r2 = V.get(b1);
      if (r2 === undefined) continue;
      const c1 = label.slice(j);
      const r3 = V.get(c1);
      if (r3 === undefined) continue;
      const k = Math.max(r1, r2, r3);
      if (k < bestKey) {
        bestKey = k;
        best = [a1, b1, c1];
      }
    }
  }
  return best;
}

/** Hyphen split + dictionary segment. Null if any letter-run is not composable. */
export function tokenise(label, V, maxWords) {
  const parts = String(label || "").split("-");
  const tokens = [];
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    if (!part) return null;
    const runs = part.match(/[a-z]+|[0-9]+/g);
    if (!runs || runs.join("") !== part) return null;
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      if (run.charCodeAt(0) >= 48 && run.charCodeAt(0) <= 57) {
        tokens.push({ t: run, num: true });
      } else {
        const seg = segment(run, V, maxWords);
        if (!seg) return null;
        for (let w = 0; w < seg.length; w++) tokens.push({ t: seg[w], num: false });
      }
    }
  }
  const words = [];
  for (let t = 0; t < tokens.length; t++) {
    if (!tokens[t].num) words.push(tokens[t].t);
  }
  return { tokens, words };
}

/** Spaced Ads phrase: dictionary words when composable, else hyphen → spaces. */
export function phraseFromLabel(label, V = VOCAB, maxWords = 3) {
  const raw = String(label || "").trim().toLowerCase();
  const fallback = raw.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  if (!fallback) return "";
  const tk = tokenise(raw, V, maxWords);
  if (tk && tk.tokens.length) {
    return tk.tokens.map((x) => x.t).join(" ");
  }
  return fallback;
}
