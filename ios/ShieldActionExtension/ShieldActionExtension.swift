import ManagedSettings
import Foundation

/// Handles taps on the shield's buttons. Primary = close the app and honor the
/// break. Secondary = "Shoo": lift the cat for this app right away — the same
/// gesture as the extension's shoo button — and let the re-armed timer run.
class ShieldActionExtension: ShieldActionDelegate {

    override func handle(
        action: ShieldAction,
        for application: ApplicationToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        switch action {
        case .primaryButtonPressed:
            completionHandler(.close)
        case .secondaryButtonPressed:
            ShieldController.unshield(app: application)
            // The threshold ladder was advanced when the cat arrived, so
            // refreshing here re-arms the next limit from a clean slate.
            try? MonitorScheduler.refreshMonitoring()
            completionHandler(.none)
        @unknown default:
            completionHandler(.close)
        }
    }

    override func handle(
        action: ShieldAction,
        for webDomain: WebDomainToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        switch action {
        case .primaryButtonPressed:
            completionHandler(.close)
        case .secondaryButtonPressed:
            let store = ShieldController.store
            var domains = store.shield.webDomains ?? []
            domains.remove(webDomain)
            store.shield.webDomains = domains.isEmpty ? nil : domains
            try? MonitorScheduler.refreshMonitoring()
            completionHandler(.none)
        @unknown default:
            completionHandler(.close)
        }
    }

    override func handle(
        action: ShieldAction,
        for category: ActivityCategoryToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        switch action {
        case .primaryButtonPressed:
            completionHandler(.close)
        case .secondaryButtonPressed:
            // Shoo the whole category — a per-app carve-out isn't possible
            // when the shield came from a category rule.
            let store = ShieldController.store
            if let policy = store.shield.applicationCategories,
               case .specific(let categories, let except) = policy {
                var remaining = categories
                remaining.remove(category)
                store.shield.applicationCategories =
                    remaining.isEmpty ? nil : .specific(remaining, except: except)
            }
            try? MonitorScheduler.refreshMonitoring()
            completionHandler(.none)
        @unknown default:
            completionHandler(.close)
        }
    }
}
