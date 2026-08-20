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
    /// Seconds the greeting overlay holds the screen before letting the user
    /// through when a watched app opens (and no break is active).
    var greetSeconds: Int = 10
    /// Pick a random cat video for each break instead of the chosen one.
    var randomCat: Bool = true
    /// Chosen cat video when random mode is off.
    var catVideoFile: String = "cat-morning-paws.mp4"
    /// Show the "Shoo" button on the cat overlay (ends the break early).
    var allowShoo: Bool = true
    /// Per-app limit overrides in minutes, keyed by the encoded ApplicationToken.
    var perAppLimitMinutes: [String: Int] = [:]

    init() {}

    /// Tolerant decoding: adding fields in an update must never wipe stored
    /// settings (a plain synthesized decoder throws on missing keys).
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        defaultLimitMinutes = try c.decodeIfPresent(Int.self, forKey: .defaultLimitMinutes) ?? 30
        breakMinutes = try c.decodeIfPresent(Int.self, forKey: .breakMinutes) ?? 15
        greetSeconds = try c.decodeIfPresent(Int.self, forKey: .greetSeconds) ?? 10
        randomCat = try c.decodeIfPresent(Bool.self, forKey: .randomCat) ?? true
        catVideoFile = try c.decodeIfPresent(String.self, forKey: .catVideoFile) ?? "cat-morning-paws.mp4"
        allowShoo = try c.decodeIfPresent(Bool.self, forKey: .allowShoo) ?? true
        perAppLimitMinutes = try c.decodeIfPresent([String: Int].self, forKey: .perAppLimitMinutes) ?? [:]
    }
}

extension ApplicationToken {
    /// Stable string key for dictionaries persisted in the App Group. Tokens
    /// are opaque by design — this never reveals which app it is.
    var storageKey: String {
        (try? JSONEncoder().encode(self))?.base64EncodedString() ?? ""
    }
}
