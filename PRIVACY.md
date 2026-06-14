# Privacy Policy

Last updated: 2026-06-14

## Summary
- We do not collect, sell, or transmit personal data.
- Your settings and usage data stay on your device and are removed when you uninstall the extension or clear its storage.
- No analytics or tracking of any kind.
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

## Data sharing
- We do not share your settings, usage times, or browsing data with anyone.
- The only third party contacted is our own Supabase storage CDN, solely to deliver cat videos (see Network requests above).

## Security
- All extension code (scripts, styles) is bundled with the extension; no executable code is fetched or run remotely.
- Only media assets (cat videos) are loaded at runtime, over HTTPS, from our Supabase storage CDN.

## Contact
Questions or issues? Email `parthbhodia08@gmail.com` with the subject "Cat Break".
