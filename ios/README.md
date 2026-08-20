# Cat Break for iOS 🐈 (native Swift)

A native SwiftUI port of the Cat Break Chrome extension, built on Apple's
Screen Time APIs (FamilyControls, DeviceActivity, ManagedSettings). Instead of
watching Chrome tabs, it watches the **apps you pick** — when your daily limit
is hit, a full-screen cat shield covers the app until your break is over.

## What maps to what

| Chrome extension | iOS app |
|---|---|
| Timer in `background.js` (active tab time) | `DeviceActivity` usage thresholds, counted by iOS itself |
| Site list / exclusions | `FamilyActivityPicker` — you pick apps, categories, and websites to watch |
| Default + per-site limits | Default limit + per-app overrides (one `DeviceActivityEvent` each) |
| Full-screen cat video overlay | Shield screen (static: cat icon + meow line + buttons — iOS does not allow video or custom UI on the shield; the cat **video** plays inside the app, e.g. Preview) |
| Auto-dismiss | Break auto-ends via a one-shot DeviceActivity schedule (≥ 15 min only — system minimum); shorter breaks end via **Shoo** or by opening Cat Break |
| Shoo button | Shield's secondary button, or "Shoo the cat now" in the app |
| Rotating meow lines | Ported verbatim; the monitor extension picks one per break |
| Midnight reset | The daily monitoring interval restarts at 00:00 |
| Cat gallery (Supabase) | Same bucket, fetched with URLSession, played with AVKit |
| "No data leaves the device" | Same — plus usage numbers are sandboxed inside Apple's report extension by OS design |

## Targets

| Target | Kind | Purpose |
|---|---|---|
| `CatBreak` | SwiftUI app | Onboarding/authorization, Cat + Settings + Stats tabs, break preview |
| `MonitorExtension` | DeviceActivityMonitor | Reacts to "limit reached" / midnight / break-end |
| `ShieldConfigExtension` | ShieldConfigurationDataSource | Styles the cat shield |
| `ShieldActionExtension` | ShieldActionDelegate | Handles shield buttons (close / Shoo) |
| `ReportExtension` | DeviceActivityReport | Renders today's usage in the Stats tab |

Shared code (settings model, App Group store, scheduler, shield controller,
meow lines) lives in `Shared/` and is compiled into every target.

## Requirements

- A Mac with **Xcode 15.4+** (Xcode 16 recommended) — or a cloud Mac.
- **XcodeGen** (`brew install xcodegen`) — the `.xcodeproj` is generated from
  `project.yml` and gitignored.
- An **Apple Developer Program** membership ($99/yr). Family Controls and App
  Groups don't work with free personal teams.
- A **real iPhone on iOS 16+**. Screen Time authorization does not work in the
  Simulator.

## Build steps

```sh
cd ios
xcodegen generate
open CatBreak.xcodeproj
```

Then, in Xcode:

1. **Rename the identifiers to yours** (the `com.catbreak` prefix is a
   placeholder). From the `ios/` folder:

   ```sh
   # bundle id prefix (5 targets)
   sed -i '' 's/com\.catbreak/com.YOURNAME.catbreak/g' project.yml
   # app group (5 entitlements files + the Swift constant)
   grep -rl 'group\.com\.catbreak\.shared' . | xargs sed -i '' 's/group\.com\.catbreak\.shared/group.com.YOURNAME.catbreak/g'
   xcodegen generate
   ```

2. Select your **Team** on all five targets (Signing & Capabilities).
   With automatic signing, Xcode registers the bundle ids, the App Group, and
   the **Family Controls (development)** capability for you. If the capability
   is missing on a target, add it manually: + Capability → Family Controls.
3. Select your device and **Run**. On first launch, tap "Allow Screen Time
   access" and approve the system prompt.
4. In **Settings → Choose apps to limit**, pick something you actually use,
   set a short default limit (e.g. 15 min), then go use that app.

## Things to know before you judge the cat

- **The shield is a static template.** Icon, title, subtitle, two buttons —
  that's every pixel iOS lets any third-party app customize. The cat video
  experience lives in the main app.
- **Thresholds are not to-the-second.** DeviceActivity events can fire a few
  minutes late. The timer is iOS's own Screen Time accounting (per-app
  foreground time), which is the same "honest timing" spirit as the extension.
- **15-minute floor.** One-shot DeviceActivity schedules must span ≥ 15
  minutes, so only breaks ≥ 15 min auto-dismiss. Shorter breaks end via the
  shield's Shoo button or by reopening Cat Break (it clears expired breaks on
  foreground).
- **Repeat limits use a threshold ladder.** Events fire once per day, so after
  each break the app re-arms monitoring with threshold = (times fired + 1) ×
  limit. That is how "timing starts fresh after a break" is implemented.
- **Tokens are opaque.** The app can render an app's name/icon via
  `Label(token)` but can never read which app it is. Settings are keyed by
  encoded tokens; they are device-specific.
- **Distribution needs Apple's blessing.** Development builds work with the
  auto-added entitlement. To ship on TestFlight/App Store you must request the
  **Family Controls (distribution)** entitlement for the app id *and each
  extension id*: <https://developer.apple.com/contact/request/family-controls-distribution>
  Expect a form about why you need it and some waiting.

## Status

This scaffold was authored off-Mac (no Xcode available), so it has **not been
compiled yet**. The API usage follows Apple's documented Screen Time surface,
but budget a first session for the usual round of compile fixes and on-device
verification — especially the shield action → unshield flow and the
threshold-ladder re-arm, which only testable on hardware.

Everything else about Cat Break applies: free, private, MIT. See the repo root
for the Chrome extension.
