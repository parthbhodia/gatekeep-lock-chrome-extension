import Foundation
import FamilyControls
import ManagedSettings

/// User settings, mirroring the Chrome extension's model
/// (default limit / per-site overrides / auto-dismiss / random cat).
struct CatBreakSettings: Codable, Equatable {
    /// Minutes of use before the cat appears, for apps without their own rule.
    var defaultLimitMinutes: Int = 30
    /// How long the cat blocks the app before leaving on its own, in minutes —
    /// the extension's "auto-dismiss". Automatic lifting rides on a
    /// DeviceActivity schedule, which has a 15-minute system minimum; below
    /// that the break ends via Shoo or by opening Cat Break.
    var breakMinutes: Int = 15
    /// Pick a random cat video for each break instead of the chosen one.
    var randomCat: Bool = true
    /// Chosen cat video when random mode is off.
    var catVideoFile: String = "cat-morning-paws.mp4"
    /// Show the "Shoo" button on the shield (ends the break early).
    var allowShoo: Bool = true
    /// Per-app limit overrides in minutes, keyed by the encoded ApplicationToken.
    var perAppLimitMinutes: [String: Int] = [:]
}

extension ApplicationToken {
    /// Stable string key for dictionaries persisted in the App Group. Tokens
    /// are opaque by design — this never reveals which app it is.
    var storageKey: String {
        (try? JSONEncoder().encode(self))?.base64EncodedString() ?? ""
    }
}
