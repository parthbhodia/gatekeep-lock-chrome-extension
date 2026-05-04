# Cat Break — Chrome Extension

> Spend too long on a site? A cat hijacks your screen. The cutest forced-break tool for Chrome.

**Cat Break** is a free Chrome extension that tracks how long you spend on websites and interrupts you with a cat video overlay when you exceed your limit. No cloud sync, no account, no ads — everything stays on your device.

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Cat%20Break-orange?logo=googlechrome)](https://chromewebstore.google.com/detail/cat-break/lnmigkmapjkmfpnjlhnmdkihpnlihagh)

---

## What it does

- **Tracks active tab time per site** — only counts time while the tab is in focus, so background tabs don't burn your limit
- **Shows a cat video overlay** when you hit your limit — you can't miss it
- **Lets you set a default limit** for all sites, plus custom overrides for specific sites
- **Excludes sites you never want tracked** (e.g., your work tools)
- **Resets daily** — totals clear automatically at midnight

---

## How to use

1. Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/cat-break/lnmigkmapjkmfpnjlhnmdkihpnlihagh)
2. Click the Cat Break icon in your toolbar
3. Set a **Default time limit** (e.g., 30 minutes) — applies to all sites
4. Optionally add **Limit by site** overrides for specific sites (e.g., youtube.com → 15 min)
5. Add any sites you want to ignore to **Excluded sites**
6. Browse normally — Cat Break runs quietly in the background

When you hit your limit, a cat appears. It lingers for a configurable duration before auto-dismissing, giving you a real break.

---

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Default time limit | Applied to every site with no custom limit | 30 min |
| Limit by site | Per-site override (e.g., youtube.com → 15 min) | None |
| Excluded sites | These sites are never tracked | None |
| Cat linger time | How long the overlay stays before auto-dismissing | 2 min |
| Cat video | Choose from 4 cat videos | Curious Cat |

---

## Why Cat Break?

Most screen-time tools are either too aggressive (blocking the site entirely) or too ignorable (a notification you dismiss in 0.1 seconds). Cat Break hits the sweet spot:

- **Hard to ignore** — a full-screen cat video is harder to dismiss than a notification
- **Not punishing** — the cat leaves after your break; you can keep browsing
- **Honest** — only tracks time when you're actually on the tab; switching away pauses the timer
- **Private** — zero data sent anywhere; see [PRIVACY.md](./PRIVACY.md)

---

## Permissions

| Permission | Why it's needed |
|-----------|----------------|
| `tabs` | Identify the active tab domain and send overlay messages |
| `storage` | Save your settings and daily usage totals locally |
| `alarms` | Run a once-per-minute timer to check limits |
| `scripting` | Inject the cat overlay into the active page |
| `http://*/*`, `https://*/*` | Allow the overlay to appear on any site you choose to limit |

No browsing data is transmitted. All data stays local and is removed on uninstall.

---

## FAQ

**Does it work on all websites?**
Yes — Cat Break can track and overlay any `http://` or `https://` site. Chrome internal pages (like `chrome://`) are excluded by design.

**Does it track me when the tab is in the background?**
No. The timer only runs while the tab is the active, focused tab. Switching tabs or apps pauses tracking immediately.

**What happens when I close Chrome?**
The timer pauses when you close Chrome and resumes when you reopen it, so a 30-minute session across two Chrome sessions correctly accumulates.

**Does the timer reset every day?**
Yes — usage totals reset at midnight each day automatically.

**Can I set different limits for different sites?**
Yes. Use the **Limit by site** section to add per-site overrides. If no override is set, the default limit applies.

**Can I snooze the cat without it counting against me?**
Yes — the overlay includes a snooze option that pauses the timer for that site temporarily.

**Is my data shared with anyone?**
No. See [PRIVACY.md](./PRIVACY.md). Nothing leaves your browser.

**Is Cat Break free?**
Yes, completely free with no ads.

---

## Privacy

All data is stored locally using `chrome.storage`. Nothing is collected, transmitted, or shared. See [PRIVACY.md](./PRIVACY.md) for the full policy.

---

## Contact

Questions or issues? Email `parthbhodia08@gmail.com` with "Cat Break" in the subject line.

---

## License

MIT
