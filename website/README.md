# catbreak.com — landing page

Static, dependency-free landing page for the Cat Break extension. Three files, no
build step, no framework.

```
website/
  index.html    all markup and copy
  styles.css    design system (mirrors the extension popup's palette and type)
  app.js        chroma-key engine, cat gallery, live break demo
  icons/        copied from the extension
```

## Running it locally

```bash
python3 -m http.server 4319 --directory website
```

Then open http://localhost:4319. (There's also a `catbreak-site` entry in
`.claude/launch.json`.)

## How the cats work

The cat clips are **green-screen sources** hosted in the same public Supabase
bucket the extension uses. Showing them raw would put a green rectangle on the
page, so `app.js` ports the extension's chroma-key pipeline from `content.js`
(`getGreenKeyStrength` / `smoothstep` / alpha-bounds crop) and paints each clip
into a `<canvas>` with the background knocked out.

Things worth knowing before editing that code:

- The source `<video>` must be **in the DOM** (`.cat-src`, visually hidden). A
  detached video is not a reliable autoplay target and `preload` won't fetch.
- `video.crossOrigin = 'anonymous'` is **required** — without it `getImageData`
  taints the canvas and the whole pipeline throws.
- Cats are keyed only while on screen (`IntersectionObserver`) and only while the
  tab is visible, at ~20fps. Nine simultaneous canvases would otherwise be heavy.
- The keyed canvas is cropped to the cat's alpha bounds, so its aspect ratio
  differs per clip **and changes frame to frame**. Every cat canvas is therefore
  absolutely positioned with an explicit width/height and `object-fit: contain`.
  Percentage heights do not resolve against an `aspect-ratio` parent, and a
  replaced element with `auto` dimensions ignores inset-based sizing — either
  mistake lets a tall cat overflow its card.

### Adding or removing a cat

Update the `CATS` array in `app.js`. Only add filenames that actually exist in
the bucket — verify first:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -r 0-100 "https://pozytitruvcthhfvpqic.supabase.co/storage/v1/object/public/cat-videos/cat-<name>.mp4"
```

`206` means it's there; `400` means it isn't.

## Deploying

Live on Vercel: **https://catbreak-seven.vercel.app**
(project `catbreak`, team `parthbhodias-projects`)

The project was created by uploading this directory directly, so it is **not yet
connected to Git** — pushing to GitHub does not redeploy it. To publish a change
today, redeploy the directory:

```bash
npx vercel deploy --prod website
```

### Recommended: connect the repo for auto-deploys

Better long-term than re-uploading. In the Vercel dashboard → project `catbreak`
→ *Settings* → *Git*, connect `parthbhodia/gatekeep-lock-chrome-extension` and
set **Root Directory** to `website`. After that every push to `main` deploys
automatically. (This needs the Vercel GitHub App, which has to be authorised
interactively — it can't be done from the CLI.)

### Pointing catbreak.com at it

catbreak.com still serves a GoDaddy "Launching Soon" holding page. To switch it:

1. Vercel → project `catbreak` → *Settings* → *Domains* → add `catbreak.com`.
2. In GoDaddy → *My Products* → *DNS*, replace the A / CNAME records for `@` and
   `www` with the values Vercel shows.
3. Turn off the GoDaddy Website Builder site so it stops answering for the domain.

## ⚠️ og.jpg is in this directory but NOT yet deployed

`website/og.jpg` (1200×630, 76 KB) exists locally and the meta tags point at it,
but **the live site returns 404 for it** — it was not included in the last
deployment. Binary files have to be base64-inlined to deploy through the MCP
tool, and a 104 KB base64 blob can't be transcribed reliably by hand.

Fix it with one deploy from this machine, which uploads the directory as-is:

```bash
npx vercel deploy --prod website
```

Until then, links to catbreak.com unfurl with no image on Slack, iMessage,
Twitter/X, and LinkedIn.

## Before going live

- [x] `llms.txt`, `robots.txt`, `sitemap.xml` — live
- [x] `canonical` / `og:url` point at `https://www.catbreak.com/` (the host that
      actually serves 200; the apex 308-redirects to it)
- [x] Cat gallery server-rendered so crawlers see the nine names without JS
- [x] `FAQPage` schema alongside `SoftwareApplication`
- [ ] **Deploy `og.jpg`** (see above)
- [ ] Update the Chrome Web Store listing — it still says "4 cats" (there are 9)
      and never mentions that Cat Break works on *any* site, which is the main
      differentiator vs. social-media-only competitors
- [ ] Swap in real Chrome Web Store rating/user numbers once there are enough to
      be worth showing. **Do not invent them** — there is deliberately no
      fabricated social proof on the page today.
