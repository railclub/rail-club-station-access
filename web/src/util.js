export const norm = (s) => (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

export const REDUCED = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Score a station against the query: exact code > name prefix > word prefix > substring > in-order letters.
export function score(st, query) {
  const nq = norm(query);
  if (!nq) return 0;
  if (st.code && norm(st.code) === nq) return 100;
  let best = 0;
  for (const n of [st.name, ...(st.aliases || [])]) {
    const nn = norm(n);
    if (nn === nq) best = Math.max(best, 95);
    else if (nn.startsWith(nq)) best = Math.max(best, 80);
    else if (n.toLowerCase().split(/\s+/).some((w) => norm(w).startsWith(nq))) best = Math.max(best, 70);
    else if (nn.includes(nq)) best = Math.max(best, 55);
    else if (nq.length >= 5 && subsequence(nq, nn)) best = Math.max(best, 30);
  }
  if (st.code && norm(st.code).startsWith(nq)) best = Math.max(best, 75);
  return best;
}
function subsequence(a, b) {
  let i = 0;
  for (const ch of b) if (ch === a[i]) i++;
  return i === a.length;
}

export const countYes = (st) => Object.values(st.features).filter((f) => f.status === "yes").length;

export function search(stations, query, limit = 8) {
  if (!query.trim()) return [];
  return stations.map((s) => [score(s, query), s]).filter(([sc]) => sc > 0)
    .sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name)).slice(0, limit).map(([, s]) => s);
}
