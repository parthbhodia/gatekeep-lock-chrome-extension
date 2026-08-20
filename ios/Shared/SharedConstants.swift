import Foundation

/// Constants shared by the app and all four extensions.
/// IMPORTANT: `appGroup` must match an App Group enabled on ALL five targets —
/// you will rename it to your own group id (see ios/README.md, "Signing").
enum SharedConstants {
    static let appGroup = "group.com.catbreak.shared"

    /// Name of the ManagedSettingsStore used for shielding. The app and the
    /// extensions open the store by this name so they all act on the same shield.
    static let managedStoreName = "catbreak"

    /// DeviceActivity activity names.
    static let dailyActivity = "catbreak.daily"
    static let breakActivity = "catbreak.break"

    /// Event covering every watched app that has no per-app override.
    static let defaultEventName = "catbreak.default"
    /// Prefix for per-app override events ("catbreak.override.<n>").
    static let overrideEventPrefix = "catbreak.override."
}
