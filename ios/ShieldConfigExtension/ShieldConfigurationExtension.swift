import ManagedSettings
import ManagedSettingsUI
import UIKit

/// Styles the full-screen cat takeover. iOS only allows a static template here
/// (icon + text + up to two buttons) — no video and no custom views, by system
/// design. The cat VIDEO plays inside the main Cat Break app instead.
class ShieldConfigurationExtension: ShieldConfigurationDataSource {

    private func catShield() -> ShieldConfiguration {
        let night = UIColor(red: 0.07, green: 0.09, blue: 0.15, alpha: 1.0)
        let cream = UIColor(red: 1.00, green: 0.95, blue: 0.86, alpha: 1.0)
        let amber = UIColor(red: 1.00, green: 0.72, blue: 0.30, alpha: 1.0)
        let showShoo = SharedStore.loadSettings().allowShoo

        return ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark,
            backgroundColor: night,
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
