import ManagedSettings
import ManagedSettingsUI
import UIKit

/// Styles the cat cover that iOS draws ON TOP of the shielded app. This is
/// the one true see-through overlay the platform allows: the system
/// composites it over the live app itself, so with no background color and
/// an ultra-thin material the real Instagram stays visible — frosted —
/// behind the cat. Template limits still apply (icon + text + two buttons;
/// no video, no custom views).
class ShieldConfigurationExtension: ShieldConfigurationDataSource {

    private func catShield() -> ShieldConfiguration {
        let night = UIColor(red: 0.07, green: 0.09, blue: 0.15, alpha: 1.0)
        let cream = UIColor(red: 1.00, green: 0.95, blue: 0.86, alpha: 1.0)
        let amber = UIColor(red: 1.00, green: 0.72, blue: 0.30, alpha: 1.0)
        let showShoo = SharedStore.loadSettings().allowShoo

        return ShieldConfiguration(
            // Translucent by design: nil background + ultra-thin dark material
            // keeps the shielded app visible underneath. An opaque color here
            // hides it — see the invariant in ios/CLAUDE.md.
            backgroundBlurStyle: .systemUltraThinMaterialDark,
            backgroundColor: nil,
            icon: UIImage(named: "shield-cat"),
            title: ShieldConfiguration.Label(text: "Cat break! 🐾", color: cream),
            subtitle: ShieldConfiguration.Label(
                text: SharedStore.currentMeowLine,
                color: cream.withAlphaComponent(0.85)
            ),
            primaryButtonLabel: ShieldConfiguration.Label(text: "Okay, taking a break", color: night),
            primaryButtonBackgroundColor: amber,
            secondaryButtonLabel: showShoo
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
