# Cat Break — Chrome Extension

> **⏰🐈** Spend too long on social media or video sites? A cat walks onto your screen and nudges you to take a break.

**Cat Break** is a free Chrome extension that tracks how long you’re **actively** on each site. When you hit your limit, a **cat video** takes over the tab with a playful message—then **clears automatically** after a break you can configure.

It’s **more flexible than a typical site blocker**: set a global default, **override per site**, **exclude** what you want, or even **only track a short list** of domains. **Random cat** mode keeps breaks surprising. **Preview** the effect anytime; **shoo** the cat away when you’re done.

No cloud sync, no account, no ads — everything stays on your device.

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Cat%20Break-orange?logo=googlechrome)](https://chromewebstore.google.com/detail/cat-break/lnmigkmapjkmfpnjlhnmdkihpnlihagh)

---

## Who this is for

- You open social feeds **without thinking**
- You look up and **an hour has gone by**
- **Notifications** are too easy to swipe away
- You want a **nudge**, not a hard block

---

## How to use

1. Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/cat-break/lnmigkmapjkmfpnjlhnmdkihpnlihagh).
2. Click the **Cat Break** icon to open the popup (**Cat** and **Settings** tabs).
3. **Cat tab:** set your **default time limit**, **auto-dismiss** duration, **random cat** (optional), pick a **cat video**, and **Preview on this tab** to try it.
4. **Settings tab:** add **Limit by site** overrides, **Excluded sites**, and optionally turn on **Only limit sites on the list below** (only listed domains are timed).
5. Browse normally — Cat Break runs in the background. When time’s up, the cat appears. Wait it out, or **shoo** it away / use **Esc** when supported.

Per-site and exclusion options live under **Settings**; the **Cat** tab focuses on timing, the break experience, and preview.

---

## How it works

- The timer runs **only while that tab is active and in focus** (switching tabs or apps **pauses** it).
- When your limit is reached, the overlay shows a **cat clip**, **friendly rotating “meow” lines**, and your time-on-site summary.
- The extension **tries to pause videos** on the page (including common players in **open shadow DOM**, e.g. YouTube); on YouTube it may **mute the tab** briefly if playback can’t be paused.
- **Totals reset at midnight** each day.
- After a break ends (or you dismiss in flows that reset the site), timing for that site **starts fresh** for the day.

---

## Settings (quick reference)

| Feature | What it does |
|--------|----------------|
| **Default time limit** | Minutes before the cat appears for sites without their own rule (quick chips: 15 / 30 / 45 / 60 / 90 min, or custom up to 600). |
| **Only limit sites on the list below** | When on, **only** domains under **Limit by site** are timed; everything else is ignored. |
| **Limit by site** | Per-domain minutes (overrides the default). |
| **Excluded sites** | Never tracked, never interrupted. |
| **Auto-dismiss** | How long the full-screen cat stays before it leaves on its own (chips + custom). |
| **Random cat** | Toggle: pick a **random** cat from the gallery each break, or always use the video you selected. |
| **Cat video** | Choose your favorite clip when random mode is off. |
| **Preview / Shoo** | See the break on the current tab; remove it from the popup when needed. |

---

## Why Cat Break?

- **Hard to ignore** — full-screen cat, not a tiny toast.
- **Not punishing** — the overlay leaves after your break; you stay in control.
- **Honest timing** — only counts real **active** tab time.
- **Private** — zero data sent anywhere; see [PRIVACY.md](./PRIVACY.md).

---

## Permissions

| Permission | Why it’s needed |
|------------|----------------|
| `tabs` | Know the active tab’s site and send the overlay |
| `storage` | Save settings and daily totals locally |
| `alarms` | Periodic checks for limits |
| `windows` | Track focus / window context where needed |
| `scripting` | Inject the cat overlay into pages |
| `http://*/*`, `https://*/*` | Show the overlay on sites you browse |

---

## FAQ

**Does it work on all websites?**  
Any normal `http` / `https` page. Chrome internal URLs (e.g. `chrome://`) are out of scope.

**Does it run in the background?**  
Only **active, focused** tab time counts. Background tabs don’t eat your limit.

**Does the timer reset every day?**  
Yes — at **midnight**.

**Can I limit just one or a few sites?**  
Yes — add them under **Limit by site** and turn on **Only limit sites on the list below**.

**Random vs one cat?**  
Turn **Random cat** on for variety; turn it off to keep your chosen clip every time.

**Is my data shared?**  
No. See [PRIVACY.md](./PRIVACY.md).

**Is Cat Break free?**  
Yes — no ads, no account.

---

## Privacy

All data stays in **`chrome.storage`** on your device. Nothing is collected for analytics or sent to a server. Full details: [PRIVACY.md](./PRIVACY.md).

---

## Contact

Questions or issues? Email `parthbhodia08@gmail.com` with **“Cat Break”** in the subject line.

---

## License

MIT
