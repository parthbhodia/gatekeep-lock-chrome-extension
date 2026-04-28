# Privacy Policy

Last updated: 2026-04-28

## Summary
- We do not collect, sell, or transmit personal data.
- All data stays on your device and is removed when you uninstall the extension or clear its storage.
- No remote code or external analytics are used.

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

## Data sharing
- No data is shared with or sent to third parties.

## Security
- All scripts and media assets are bundled with the extension; no remote code is fetched.

## Contact
Questions or issues? Email `zokuzoku.app@gmail.com` with the subject "Cat Gatekeeper".
