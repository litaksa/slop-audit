// GET /api/read?url=https://example.com/post
// Fetches one page and returns plain text plus a byline and a publish date when it can find them.
// Deliberately narrow: HTML only, size-capped, public hosts only.

const UA =
  "Mozilla/5.0 (compatible; SlopAudit/1.0; +https://github.com/) reading a few pages for text analysis";

const PRIVATE =
  /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|172\.(1[6-9]|2\d|3[01])\.)/i;

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–",
  hellip: "…", rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201D", ldquo: "\u201C", eacute: "é",
};

function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function pick(html, re) {
  const m = html.match(re);
  return m ? decode(m[1]).replace(/\s+/g, " ").trim() : "";
}

function findAuthor(html) {
  const tries = [
    /<meta[^>]+name=["']author["'][^>]+content=["']([^"']{2,80})["']/i,
    /<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']{2,80})["']/i,
    /rel=["']author["'][^>]*>([^<]{2,60})</i,
    /class=["'][^"']*\bauthor(?:-name)?\b[^"']*["'][^>]*>\s*([^<]{2,60})</i,
    /\bBy\s+<[^>]+>([A-Z][^<]{2,50})</,
  ];
  for (const re of tries) {
    const v = pick(html, re);
    // "admin" and "staff" are not bylines in any meaningful sense
    if (v && !/^(admin|administrator|staff|editor|team|redaksi)$/i.test(v)) return v;
  }
  return "";
}

function findDate(html) {
  const tries = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["'](?:date|pubdate|publish-date)["'][^>]+content=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];
  for (const re of tries) {
    const v = pick(html, re);
    if (v && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  }
  return "";
}

function extract(html) {
  let h = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|form|template)[\s\S]*?<\/\1>/gi, " ");

  // Prefer the real body of the page if the markup says where it is.
  const body =
    h.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
    h.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
    h.match(/<div[^>]+class=["'][^"']*\b(post-content|entry-content|article-body|content-body)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (body) h = body[body.length - 1];

  h = h
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|section|article|tr)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");

  return decode(h)
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default async function handler(req, res) {
  const raw = String(req.query.url || "").trim();
  let u;
  try {
    u = new URL(raw);
  } catch {
    return res.status(400).json({ error: "Bad URL" });
  }
  if (!/^https?:$/.test(u.protocol) || PRIVATE.test(u.hostname)) {
    return res.status(400).json({ error: "That host isn't allowed" });
  }

  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 9000);
  try {
    const r = await fetch(u.toString(), {
      signal: stop.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    });
    if (!r.ok) return res.status(200).json({ url: raw, error: "Page returned " + r.status });

    const type = r.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/i.test(type))
      return res.status(200).json({ url: raw, error: "Not an HTML page" });

    let html = await r.text();
    if (html.length > 2_500_000) html = html.slice(0, 2_500_000);

    const text = extract(html);
    const title =
      pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ||
      pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);

    res.setHeader("cache-control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json({
      url: raw,
      title,
      author: findAuthor(html),
      published: findDate(html),
      words: text ? text.trim().split(/\s+/).length : 0,
      text: text.slice(0, 40000),
    });
  } catch (e) {
    return res
      .status(200)
      .json({ url: raw, error: e.name === "AbortError" ? "Timed out" : "Couldn't fetch" });
  } finally {
    clearTimeout(timer);
  }
}
