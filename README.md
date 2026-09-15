# Slop Audit

Samples a site's pages and shows which AI-writing patterns run across all of them.
No API keys, no accounts, no database.

## How it works

- `api/pages.js` — reads the site's own `sitemap.xml` (falling back to homepage links) and
  returns a handful of article URLs, spread across the archive rather than the newest few.
- `api/read.js` — fetches one page and returns plain text, plus byline and publish date
  when the markup exposes them.
- `index.html` — scores everything in the browser. No text is stored anywhere.

The scoring is heuristic: stock phrasing, uniform sentence and paragraph lengths, bullet
density, absence of checkable detail, and — the part that actually matters — what repeats
across pages. Identical phrases in every article, posts published in one burst, and scores
that cluster too tightly say more than any single page does.

## Deploy

```bash
git init
git add .
git commit -m "slop audit"
git remote add origin git@github.com:litaksa/slop-audit.git
git push -u origin main
```

Then on vercel.com: Add New → Project → import the repo → Deploy. No settings to change,
no environment variables. Vercel serves `index.html` as a static file and turns `api/*.js`
into serverless functions automatically.

Or straight from the terminal:

```bash
npx vercel
```

## Local

```bash
npx vercel dev
```

Opening `index.html` directly with `file://` will not work — the `/api` routes need a server.

## Notes

- `api/read.js` is a public endpoint that fetches URLs on request. It's limited to HTML over
  http(s), blocks private address ranges, caps body size, and times out after 9 seconds.
  Responses are cached at the edge for an hour. If the project ever gets real traffic, add
  rate limiting before anything else.
- Sites that render their content entirely in JavaScript will come back with no text. The
  Paste articles tab covers those.
- A score is a reason to read more closely, not a verdict. No tool can prove authorship.
