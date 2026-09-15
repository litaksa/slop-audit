// GET /api/pages?domain=example.com&n=6
// Finds article URLs for a domain, preferring its sitemap. No API keys, no crawling beyond
// a handful of index files.

const SITEMAPS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/wp-sitemap.xml",
  "/sitemap/sitemap.xml",
  "/sitemap1.xml",
];

const SKIP_PATH = /\/(tag|tags|category|categories|topic|author|writers?|page|feed|rss|search|amp|wp-content|wp-json|cdn-cgi|privacy|terms|contact|about)(\/|$)/i;
const SKIP_EXT = /\.(xml|xml\.gz|jpe?g|png|gif|webp|svg|pdf|css|js|zip|mp4|mp3)(\?|$)/i;

const UA =
  "Mozilla/5.0 (compatible; SlopAudit/1.0; +https://github.com/) reading a few pages for text analysis";

function decode(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function grab(url, ms = 8000) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: stop.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xml,*/*" },
    });
    if (!r.ok) return null;
    const body = await r.text();
    return body.length > 4_000_000 ? body.slice(0, 4_000_000) : body;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const locsOf = (xml) =>
  [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => decode(m[1].trim()));

function keep(url, host) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    if (!u.hostname.endsWith(host.replace(/^www\./, ""))) return false;
    if (u.pathname === "/" || u.pathname === "") return false;
    if (SKIP_PATH.test(u.pathname)) return false;
    if (SKIP_EXT.test(u.pathname)) return false;
    return u.pathname.split("/").filter(Boolean).length >= 1;
  } catch {
    return false;
  }
}

// Spread the sample across the whole list instead of taking the newest N in a row.
function spread(list, n) {
  if (list.length <= n) return list;
  const step = list.length / n;
  return Array.from({ length: n }, (_, i) => list[Math.floor(i * step)]);
}

async function fromSitemap(origin, host) {
  for (const path of SITEMAPS) {
    const xml = await grab(origin + path);
    if (!xml || !/<(urlset|sitemapindex)/i.test(xml)) continue;

    let urls = [];
    if (/<sitemapindex/i.test(xml)) {
      // An index of sitemaps: prefer the ones that look like posts.
      const children = locsOf(xml)
        .filter((u) => !/image|video|category|tag|author/i.test(u))
        .sort((a, b) => (/post|article|news|blog/i.test(b) ? 1 : 0) - (/post|article|news|blog/i.test(a) ? 1 : 0))
        .slice(0, 3);
      for (const child of children) {
        const sub = await grab(child);
        if (sub) urls.push(...locsOf(sub));
      }
    } else {
      urls = locsOf(xml);
    }

    urls = [...new Set(urls)].filter((u) => keep(u, host));
    if (urls.length) return { urls, source: path };
  }
  return null;
}

async function fromHomepage(origin, host) {
  const html = await grab(origin + "/");
  if (!html) return null;
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const urls = [
    ...new Set(
      hrefs
        .map((h) => {
          try {
            return new URL(decode(h), origin).toString().split("#")[0];
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .filter((u) => keep(u, host))
    ),
  ];
  return urls.length ? { urls, source: "homepage links" } : null;
}

export default async function handler(req, res) {
  const raw = String(req.query.domain || "").trim();
  const n = Math.min(12, Math.max(1, parseInt(req.query.n, 10) || 6));

  const host = raw
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();

  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) {
    return res.status(400).json({ error: "That doesn't look like a domain. Try example.com" });
  }

  res.setHeader("cache-control", "public, s-maxage=3600, stale-while-revalidate=86400");

  for (const origin of [`https://${host}`, `https://www.${host}`]) {
    const found = (await fromSitemap(origin, host)) || (await fromHomepage(origin, host));
    if (found) {
      return res.status(200).json({
        host,
        source: found.source,
        total: found.urls.length,
        urls: spread(found.urls, n),
      });
    }
  }

  return res.status(404).json({
    error: "No sitemap and no usable links on the homepage.",
    host,
  });
}
