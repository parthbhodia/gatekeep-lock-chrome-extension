import Foundation
import DeviceActivity
import FamilyControls
import ManagedSettings

/// Builds and (re)starts DeviceActivity monitoring from the persisted
/// selection + settings — the Swift counterpart of background.js's alarm loop.
/// Called from the app (after settings change) and from the extensions
/// (to advance the threshold ladder after a break).
enum MonitorScheduler {
    static let dailyActivity = DeviceActivityName(SharedConstants.dailyActivity)
    static let breakActivity = DeviceActivityName(SharedConstants.breakActivity)
    static let defaultEvent = DeviceActivityEvent.Name(SharedConstants.defaultEventName)

    /// All-day window; repeats, so totals reset at midnight like the extension.
    private static var dailySchedule: DeviceActivitySchedule {
        DeviceActivitySchedule(
            intervalStart: DateComponents(hour: 0, minute: 0),
            intervalEnd: DateComponents(hour: 23, minute: 59),
            repeats: true
        )
    }

    /// Restart monitoring using the current persisted state.
    static func refreshMonitoring() throws {
        let selection = SharedStore.loadSelection()
        let settings = SharedStore.loadSettings()
        let center = DeviceActivityCenter()
        center.stopMonitoring([dailyActivity])

        let events = buildEvents(
            selection: selection,
            settings: settings,
            fireCounts: SharedStore.fireCounts()
        )
        guard !events.isEmpty else { return }
        try center.startMonitoring(dailyActivity, during: dailySchedule, events: events)
    }

    static func stopAll() {
        DeviceActivityCenter().stopMonitoring()
    }

    /// One event per overridden app + one default event for everything else.
    static func buildEvents(
        selection: FamilyActivitySelection,
        settings: CatBreakSettings,
        fireCounts: [String: Int]
    ) -> [DeviceActivityEvent.Name: DeviceActivityEvent] {
        var events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [:]

        for (index, token) in overriddenApplications(selection: selection, settings: settings) {
            let name = DeviceActivityEvent.Name(SharedConstants.overrideEventPrefix + String(index))
            let minutes = settings.perAppLimitMinutes[token.storageKey] ?? settings.defaultLimitMinutes
            let fires = fireCounts[name.rawValue] ?? 0
            events[name] = DeviceActivityEvent(
                applications: [token],
                categories: [],
                webDomains: [],
                threshold: DateComponents(minute: max(1, minutes) * (fires + 1))
            )
        }

        let defaultApps = selection.applicationTokens.filter {
            settings.perAppLimitMinutes[$0.storageKey] == nil
        }
        if !defaultApps.isEmpty || !selection.categoryTokens.isEmpty || !selection.webDomainTokens.isEmpty {
            let fires = fireCounts[defaultEvent.rawValue] ?? 0
            events[defaultEvent] = DeviceActivityEvent(
                applications: defaultApps,
                categories: selection.categoryTokens,
                webDomains: selection.webDomainTokens,
                threshold: DateComponents(minute: max(1, settings.defaultLimitMinutes) * (fires + 1))
            )
        }
        return events
    }

    /// Stable (index, token) pairs for overridden apps. The index keeps event
    /// names deterministic between the app and the extensions.
    static func overriddenApplications(
        selection: FamilyActivitySelection,
        settings: CatBreakSettings
    ) -> [(Int, ApplicationToken)] {
        selection.applicationTokens
            .filter { settings.perAppLimitMinutes[$0.storageKey] != nil }
            .sorted { $0.storageKey < $1.storageKey }
            .enumerated()
            .map { ($0.offset, $0.element) }
    }

    /// Tokens covered by a given event name — how the monitor extension knows
    /// what to shield when a threshold fires.
    static func coverage(
        of eventName: DeviceActivityEvent.Name
    ) -> (apps: Set<ApplicationToken>, categories: Set<ActivityCategoryToken>, webDomains: Set<WebDomainToken>) {
        let selection = SharedStore.loadSelection()
        let settings = SharedStore.loadSettings()

        if eventName == defaultEvent {
            let apps = selection.applicationTokens.filter {
                settings.perAppLimitMinutes[$0.storageKey] == nil
            }
            return (apps, selection.categoryTokens, selection.webDomainTokens)
        }
        if eventName.rawValue.hasPrefix(SharedConstants.overrideEventPrefix),
           let index = Int(eventName.rawValue.dropFirst(SharedConstants.overrideEventPrefix.count)) {
            let overridden = overriddenApplications(selection: selection, settings: settings)
            if let match = overridden.first(where: { $0.0 == index }) {
                return ([match.1], [], [])
            }
        }
        return ([], [], [])
    }

    /// Schedules the automatic end of a break (the extension's auto-dismiss).
    /// DeviceActivity enforces a 15-minute minimum interval, so shorter breaks
    /// end via Shoo or when the user opens Cat Break instead.
    static func scheduleBreakEnd(after minutes: Int) {
        SharedStore.breakEndsAt = Date().addingTimeInterval(TimeInterval(minutes * 60))
        guard minutes >= 15 else { return }
        let start = Date()
        let end = start.addingTimeInterval(TimeInterval(minutes * 60))
        let calendar = Calendar.current
        let schedule = DeviceActivitySchedule(
            intervalStart: calendar.dateComponents([.hour, .minute, .second], from: start),
            intervalEnd: calendar.dateComponents([.hour, .minute, .second], from: end),
            repeats: false
        )
        try? DeviceActivityCenter().startMonitoring(breakActivity, during: schedule, events: [:])
    }
}
