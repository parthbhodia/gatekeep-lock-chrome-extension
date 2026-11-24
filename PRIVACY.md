# Privacy Policy

Last updated: 2026-11-21

This policy covers the **Cat Break browser extension**. The catbreak.com marketing
website is covered separately at https://www.catbreak.com/privacy.html — unlike the
extension, that website does use Google Analytics to count visits.

## Summary
- We do not collect, sell, or transmit personal data, and we never see your browsing history.
- Your settings and site time totals stay on your device and are removed when you uninstall the extension or clear its storage.
- The extension sends a few **anonymous usage statistics** (counts only, listed below) so we can tell whether the cat loads and how breaks go. It is on by default and you can turn it off under **Settings → Share anonymous usage stats**.
- Cat videos are loaded and cached from our Supabase storage CDN; no executable code is fetched remotely.

## Data we access
- Active tab domain and timing to enforce your per-site limits.
- Your settings (default limit, per-site limits, cat linger time, chosen video) and per-site usage totals stored locally via `chrome.storage`.
- Temporary snooze flags and last-reset date stored locally.

## How we use permissions
- `tabs`: identify the active tab/domain and send overlay messages to that tab.
- `storage`: save your settings, time totals, snooze flags, and last reset locally.
- `alarms`: run a periodic timer to increment usage and check limits.
- `scripting`: inject the overlay script/CSS if the content script is not already present.
- `http://*/*`, `https://*/*` host access: allow the overlay to appear on sites you choose to limit; browsing data is not transmitted.

## Network requests
- Cat videos are fetched and cached from our Supabase storage bucket (`pozytitruvcthhfvpqic.supabase.co`). Delivering them exposes standard request metadata (such as your IP address) to Supabase, as with loading any image or video on the web.
- These requests carry no browsing history, site names, usage times, or personal identifiers — only the name of the video file being downloaded.

## Anonymous usage statistics
Sent to our own Supabase project (`pozytitruvcthhfvpqic.supabase.co`), on by default, and switched off at any time under **Settings → Share anonymous usage stats**. We use them to find and fix problems (for example, a cat that fails to load) and to see which settings people actually use. Only these reports are sent:
- **When the extension starts:** its version, why it started (install, update or browser start), and your settings as plain numbers and on/off values: default limit, auto-dismiss minutes, shoo hold seconds, whether "only social media sites", "only listed sites" and random cat are on, and how many sites are in your limit and excluded lists.
- **When a break appears:** whether the animated cat played or the fallback icon was shown, for the fallback a short reason code such as `no_clip`, `timeout` or `play_failed`, and which built-in site it was on.
- **When a break ends:** how it ended (Esc held, the timer ran out, or the popup's Shoo button), how many seconds it was on screen, and which built-in site it was on.

The "built-in site" is one of a fixed list that Cat Break times by default (YouTube, Instagram, Facebook, X/Twitter, TikTok, Reddit, Snapchat, Pinterest, Twitch, Threads, Tumblr, Bluesky and Amazon), or the word `other`. The name of any site that is not on that list is never sent.

Never sent: the name or URL of any site outside that fixed list, the contents of any page, your own site lists, your browsing history, or anything that identifies you. No account, device ID or other persistent identifier is attached, so one report cannot be linked to another. As with the cat videos, Supabase's own request logs may include standard request metadata such as your IP address; we do not store it with the statistics.

## Data sharing
- We do not share your settings, usage times, or browsing data with anyone.
- The only third party contacted is our own Supabase project, to deliver cat videos and to receive the anonymous usage statistics above.

## Security
- All extension code (scripts, styles) is bundled with the extension; no executable code is fetched or run remotely.
- Only media assets (cat videos) are loaded at runtime, over HTTPS, from our Supabase storage CDN.

## Contact
Questions or issues? Email `parthbhodia08@gmail.com` with the subject "Cat Break".
