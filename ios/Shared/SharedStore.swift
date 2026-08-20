import Foundation
import FamilyControls

/// Persistence shared between the app and the extensions via the App Group.
/// Everything stays on-device — the same privacy posture as the extension's
/// chrome.storage.local.
enum SharedStore {
    private static var defaults: UserDefaults {
        UserDefaults(suiteName: SharedConstants.appGroup) ?? .standard
    }

    private enum Key {
        static let settings = "settings"
        static let selection = "familyActivitySelection"
        static let eventFireCounts = "eventFireCounts"
        static let breakEndsAt = "breakEndsAt"
        static let currentMeowLine = "currentMeowLine"
        static let lastTakeoverAt = "lastTakeoverAt"
    }

    // MARK: - Settings

    static func loadSettings() -> CatBreakSettings {
        guard let data = defaults.data(forKey: Key.settings),
              let settings = try? JSONDecoder().decode(CatBreakSettings.self, from: data)
        else { return CatBreakSettings() }
        return settings
    }

    static func save(_ settings: CatBreakSettings) {
        if let data = try? JSONEncoder().encode(settings) {
            defaults.set(data, forKey: Key.settings)
        }
    }

    // MARK: - Watched apps

    static func loadSelection() -> FamilyActivitySelection {
        guard let data = defaults.data(forKey: Key.selection),
              let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
        else { return FamilyActivitySelection() }
        return selection
    }

    static func save(_ selection: FamilyActivitySelection) {
        if let data = try? JSONEncoder().encode(selection) {
            defaults.set(data, forKey: Key.selection)
        }
    }

    // MARK: - Threshold ladder
    // DeviceActivity thresholds fire once per interval. To restart the timer
    // after a break (the extension's "starts fresh for the day"), we track how
    // many times each event fired today and schedule the next threshold at
    // (fires + 1) × limit of total usage for the day.

    static func fireCounts() -> [String: Int] {
        (defaults.object(forKey: Key.eventFireCounts) as? [String: Int]) ?? [:]
    }

    static func bumpFireCount(for eventName: String) {
        var counts = fireCounts()
        counts[eventName, default: 0] += 1
        defaults.set(counts, forKey: Key.eventFireCounts)
    }

    static func resetFireCounts() {
        defaults.removeObject(forKey: Key.eventFireCounts)
    }

    // MARK: - Break state

    static var breakEndsAt: Date? {
        get {
            let t = defaults.double(forKey: Key.breakEndsAt)
            return t > 0 ? Date(timeIntervalSince1970: t) : nil
        }
        set { defaults.set(newValue?.timeIntervalSince1970 ?? 0, forKey: Key.breakEndsAt) }
    }

    // MARK: - Shield copy

    /// The monitor extension picks a meow line when the cat arrives; the shield
    /// configuration extension reads it, so every break shows a fresh message.
    static var currentMeowLine: String {
        get { defaults.string(forKey: Key.currentMeowLine) ?? MeowLines.all[0] }
        set { defaults.set(newValue, forKey: Key.currentMeowLine) }
    }

    // MARK: - Greeting takeover

    /// When the last greeting takeover happened — the cat "naps" for a few
    /// minutes afterwards so returning to the greeted app doesn't re-trigger
    /// the automation in a loop.
    static var lastTakeoverAt: Date? {
        get {
            let t = defaults.double(forKey: Key.lastTakeoverAt)
            return t > 0 ? Date(timeIntervalSince1970: t) : nil
        }
        set { defaults.set(newValue?.timeIntervalSince1970 ?? 0, forKey: Key.lastTakeoverAt) }
    }
}
