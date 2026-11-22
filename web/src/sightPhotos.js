// Real photos for Journey Partner's sights, from Wikimedia Commons: openly licensed, and every
// card credits the photographer and licence. Looked up in the visitor's browser:
// 1. a sight with a Wikidata id: its main image (Wikidata's "image" property, P18);
// 2. otherwise a named sight: the best Commons photo with that name taken within 3 km of it.
// Nothing is guessed beyond that, so a sight without a matching photo simply shows its icon.
// Answers are remembered in this browser for a month, so a journey opened again is instant.

const COMMONS = "https://commons.wikimedia.org/w/api.php";
const WIKIDATA = "https://www.wikidata.org/w/api.php";
const KEY = "jp-photos-v1";
const MONTH = 30 * 86_400_000;
const PHOTO_TYPES = /^image\/(jpeg|png|webp)$/;

let memo = null;
function cache() {
  if (memo) return memo;
  memo = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    for (const [id, v] of Object.entries(saved)) if (Date.now() - v.at < MONTH) memo.set(id, v);
  } catch {
    // private window or blocked storage: look everything up again
  }
  return memo;
}
function save() {
  try {
    const recent = [...cache()].sort((a, b) => b[1].at - a[1].at).slice(0, 600);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(recent)));
  } catch {
    // fine: it's only a speed-up
  }
}

async function api(base, params) {
  const url = `${base}?${new URLSearchParams({ format: "json", origin: "*", ...params })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

// The author field is HTML; DOMParser's document is inert (no scripts, no image loads).
const plain = (html) => (new DOMParser().parseFromString(html ?? "", "text/html").body.textContent ?? "").replace(/\s+/g, " ").trim();

const INFO = { prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "720", iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl" };

/** A Commons file page from the API, as a photo we may show, or null. */
function photo(page) {
  const i = page?.imageinfo?.[0];
  const m = i?.extmetadata ?? {};
  const license = m.LicenseShortName?.value;
  if (!i?.thumburl || !PHOTO_TYPES.test(i.mime ?? "") || !license) return null;
  return {
    thumb: i.thumburl,
    page: i.descriptionurl,
    author: plain(m.Artist?.value).slice(0, 80) || "Unknown author",
    license,
    licenseUrl: m.LicenseUrl?.value ?? "",
  };
}

async function fromWikidata(qid) {
  const d = await api(WIKIDATA, { action: "wbgetclaims", entity: qid, property: "P18" });
  const file = d.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!file) return null;
  const q = await api(COMMONS, { action: "query", titles: `File:${file}`, ...INFO });
  return photo(Object.values(q.query?.pages ?? {})[0]);
}

async function fromSearch(s) {
  const words = s.title.replace(/[^\p{L}\p{N} ]/gu, " ").trim();
  if (words.length < 3) return null;
  const q = await api(COMMONS, {
    action: "query", generator: "search", gsrnamespace: "6", gsrlimit: "3",
    gsrsearch: `${words} filetype:bitmap nearcoord:3km,${s.lat},${s.lon}`, ...INFO,
  });
  const pages = Object.values(q.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  for (const p of pages) {
    const ph = photo(p);
    if (ph) return ph;
  }
  return null;
}

/** Photos for the sights (best first, at most `max`), passed to onPhoto(id, photo) as each one
 * arrives. Returns a function that stops the lookups. */
export function loadPhotos(sights, onPhoto, max = 40) {
  let stopped = false;
  const store = cache();
  const todo = sights.filter((s) => s.kind !== "tunnel" && s.title).sort((a, b) => b.score - a.score).slice(0, max);
  for (const s of todo) {
    const hit = store.get(s.id);
    if (hit?.photo) onPhoto(s.id, hit.photo);
  }
  const queue = todo.filter((s) => !store.has(s.id));
  const worker = async () => {
    while (!stopped && queue.length) {
      const s = queue.shift();
      let ph = null;
      try {
        ph = (s.wikidata && /^Q\d+$/.test(s.wikidata) ? await fromWikidata(s.wikidata) : null) ?? await fromSearch(s);
      } catch {
        continue; // try again next visit
      }
      store.set(s.id, { at: Date.now(), photo: ph });
      if (!stopped && ph) onPhoto(s.id, ph);
    }
    save();
  };
  Promise.all([worker(), worker(), worker(), worker()]);
  return () => { stopped = true; };
}
