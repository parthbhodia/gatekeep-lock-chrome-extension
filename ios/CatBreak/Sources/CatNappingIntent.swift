import AppIntents
import Foundation

/// Shortcuts action for the greeting automation's loop guard: returns Yes for
/// a few minutes after each takeover, so "Instagram → Cat Break → Instagram"
/// doesn't trigger the greeting again on the way back.
struct CatNappingIntent: AppIntent {
    static var title: LocalizedStringResource = "Is the cat napping?"
    static var description = IntentDescription(
        "True for 3 minutes after a cat greeting. Use it in your greeting automation: only open the greeting link when this is No."
    )

    func perform() async throws -> some IntentResult & ReturnsValue<Bool> {
        let napping: Bool
        if let last = SharedStore.lastTakeoverAt {
            napping = Date().timeIntervalSince(last) < 180
        } else {
            napping = false
        }
        return .result(value: napping)
    }
}
