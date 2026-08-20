# CLAUDE.md — ios/

Native SwiftUI port of the Cat Break Chrome extension (repo root) using
Apple's Screen Time stack. Read `ios/README.md` first for the target map and
the extension→iOS feature mapping.

## Build & run

- `xcodegen generate` (in `ios/`) → `CatBreak.xcodeproj`. Never edit the
  xcodeproj by hand; edit `project.yml` and regenerate.
- Build: `xcodebuild -project CatBreak.xcodeproj -scheme CatBreak -destination 'generic/platform=iOS' build`
- **Real device only.** FamilyControls authorization fails in the Simulator;
  most Screen Time behavior is untestable there.
- All five targets share `Shared/` — after touching anything in `Shared/`,
  rebuild the whole app (extensions are embedded).

## Architecture in one paragraph

The app persists `CatBreakSettings` + `FamilyActivitySelection` into the App
Group (`SharedStore`), and `MonitorScheduler.refreshMonitoring()` turns them
into DeviceActivity events (one per per-app override + one default). iOS runs
the timers. `MonitorExtension` gets `eventDidReachThreshold`, picks a meow
line, and shields the covered tokens via `ShieldController` (a named
ManagedSettingsStore, "catbreak", shared by name across processes).
`ShieldConfigExtension` styles the shield; `ShieldActionExtension` handles its
buttons (Shoo = unshield + re-arm). Because events fire once per interval,
repeat limits use a fire-count ladder: next threshold = (fires + 1) × limit
(`SharedStore.fireCounts`). `ReportExtension` renders today's usage; the app
embeds it but cannot read the numbers (OS sandbox).

## Invariants / gotchas

- `SharedConstants.appGroup` must equal the group in all five `.entitlements`
  files and the developer portal. One string, six places — grep before ship.
- Event names are deterministic (`catbreak.default`, `catbreak.override.<n>`
  sorted by token storageKey) so the monitor extension can recompute coverage
  without the app running. Don't break that ordering.
- `intervalDidStart` fires on every monitoring restart, not just midnight —
  the midnight-reset guard in `DeviceActivityMonitorExtension` exists for that.
- DeviceActivity: schedules min 15 min; thresholds can fire late; ~20 activity
  limit per app. Don't add per-app activities — keep one daily activity.
- Shield UI is a fixed template (`ShieldConfiguration`): no video, no custom
  views. Don't try. And keep it translucent: `backgroundColor: nil` plus the
  ultra-thin material is what lets the shielded app show through frosted —
  an opaque backgroundColor hides it and defeats the see-through design.
- Cat videos stream from the Supabase bucket in `CatVideoLibrary` (same as
  `background.js`). Anon key is publishable/read-only by design.
- Distribution requires the Family Controls entitlement from Apple for the app
  **and every extension** bundle id.
- No model identifiers or AI attribution in code, commits amended here, or
  App Store metadata.

## Verification checklist for changes (on device)

1. Fresh install → authorize → pick one app, 15-min limit → use app → shield
   appears (may lag a couple of minutes).
2. Shoo on shield → app usable again; after another `limit` of use the shield
   returns (ladder working).
3. Cross midnight (or set device clock forward) → shields clear, counts reset.
4. Stats tab shows today's totals for watched apps.

## Greeting overlay (cat on top of Instagram)

- Deep link: `catbreak://break?return=<scheme>` (registered in
  `CatBreak/Info.plist`) → `AppModel.handleDeepLink` → full-screen
  `CatOverlayView` (`.greeting` mode). Set up by the user as a Shortcuts
  "App Is Opened" automation via `GreetingSetupView` (Settings tab).
- The cat is chroma-keyed: `ChromaKey.swift` ports content.js's
  getGreenKeyStrength verbatim (0–255 domain) into a 64³ CIColorCube used as
  an AVVideoComposition; `KeyedPlayerUIView` sets BGRA pixelBufferAttributes
  on the AVPlayerLayer or the alpha won't render. Keep the constants in sync
  with content.js if the extension's keying changes.
- Overlay modes: `.preview` (Cat tab, capped at 3 min), `.greeting` with
  active break → linger until `SharedStore.breakEndsAt`, else greet for
  `settings.greetSeconds` then auto-continue.
- Loop guard is two-sided: `CatNappingIntent` (Shortcuts If-guard) and the
  180-second nap check in `handleDeepLink`. Keep the two windows in sync.
- `CatBreakSettings` uses decodeIfPresent for every field — adding a field
  must never wipe stored settings. Preserve that when editing.
- CI: `.github/workflows/ios-build.yml` builds unsigned for the simulator on
  macOS runners and captures two screenshots: tabs (`-catbreak-ui-preview`)
  and the overlay (`-catbreak-overlay-preview`). Both launch args bypass the
  auth gate for UI rendering only.
