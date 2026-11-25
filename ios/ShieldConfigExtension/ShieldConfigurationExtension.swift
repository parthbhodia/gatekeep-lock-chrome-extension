import ManagedSettings
import ManagedSettingsUI
import UIKit

/// Styles the cat cover that iOS draws ON TOP of the shielded app. This is
/// the one true see-through overlay the platform allows: the system
/// composites it over the live app itself, so — like the extension's
/// overlay over a web page — the real Instagram stays visible behind the
/// cat. Template limits still apply (icon + text + two buttons; no video, no
/// custom views), so the countdown is a line of text, not a ticking clock.
class ShieldConfigurationExtension: ShieldConfigurationDataSource {

    private func catShield() -> ShieldConfiguration {
        let night = UIColor(red: 0.07, green: 0.09, blue: 0.15, alpha: 1.0)
        let cream = UIColor(red: 1.00, green: 0.95, blue: 0.86, alpha: 1.0)
        let amber = UIColor(red: 1.00, green: 0.72, blue: 0.30, alpha: 1.0)
        let settings = SharedStore.loadSettings()
        let remaining = SharedStore.breakMinutesRemaining
        let breakOver = remaining == 0

        // Backdrop. content.css's .fcb-backdrop is a faint dark tint with no
        // blur, so the page stays sharp under the cat; `.clear` mirrors it
        // with no blur style and a translucent tint (never an opaque color —
        // that would hide the app and defeat the whole point). `.frosted`
        // keeps iOS's thinnest material, easier to read over bright feeds.
        let blur: UIBlurEffect.Style?
        let tint: UIColor?
        switch settings.shieldBackdrop {
        case .clear:
            blur = nil
            tint = UIColor(red: 26 / 255, green: 18 / 255, blue: 13 / 255, alpha: 0.35)
        case .frosted:
            blur = .systemUltraThinMaterialDark
            tint = nil
        }

        // Copy. iOS asks for this configuration each time the shield is
        // shown, so the minutes are right whenever the user opens the app —
        // the extension's countdown, as far as a static template allows.
        let title: String
        let subtitle: String
        let primary: String
        if breakOver {
            // The break elapsed but nothing lifted the shield yet (breaks
            // under 15 min can't auto-end): the primary button lets them in.
            title = "Break's over 🐾"
            subtitle = "The cat's napping. Tap to get back in."
            primary = "Let me in"
        } else {
            if let remaining {
                title = "Cat break 🐾 \(remaining) min left"
            } else {
                title = "Cat break! 🐾"
            }
            subtitle = SharedStore.currentMeowLine
            primary = "Okay, taking a break"
        }

        return ShieldConfiguration(
            backgroundBlurStyle: blur,
            backgroundColor: tint,
            // A real cat, not the logo: a chroma-keyed still baked from the
            // actual cat videos (ShieldCatBaker). Different cat per break in
            // random mode; the bundled icon only covers the very first runs.
            icon: ShieldCatFrames.frameForCurrentSettings() ?? UIImage(named: "shield-cat"),
            title: ShieldConfiguration.Label(text: title, color: cream),
            subtitle: ShieldConfiguration.Label(text: subtitle, color: cream.withAlphaComponent(0.85)),
            primaryButtonLabel: ShieldConfiguration.Label(text: primary, color: night),
            primaryButtonBackgroundColor: amber,
            secondaryButtonLabel: (settings.allowShoo && !breakOver)
                ? ShieldConfiguration.Label(text: "Shoo — let me back in", color: cream.withAlphaComponent(0.7))
                : nil
        )
    }

    override func configuration(shielding application: Application) -> ShieldConfiguration {
        catShield()
    }

    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
        catShield()
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        catShield()
    }

    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration {
        catShield()
    }
}
