import Foundation
import ManagedSettings
import FamilyControls

/// Applies and lifts the cat shield. Shared so the monitor extension can drop
/// the cat in, the shield-action extension can shoo it, and the app can clean up.
enum ShieldController {
    static var store: ManagedSettingsStore {
        ManagedSettingsStore(named: ManagedSettingsStore.Name(SharedConstants.managedStoreName))
    }

    static func shield(
        apps: Set<ApplicationToken>,
        categories: Set<ActivityCategoryToken>,
        webDomains: Set<WebDomainToken>
    ) {
        let s = store
        if !apps.isEmpty {
            s.shield.applications = (s.shield.applications ?? []).union(apps)
        }
        if !categories.isEmpty {
            var existing: Set<ActivityCategoryToken> = []
            if let policy = s.shield.applicationCategories,
               case .specific(let current, _) = policy {
                existing = current
            }
            s.shield.applicationCategories = .specific(existing.union(categories))
        }
        if !webDomains.isEmpty {
            s.shield.webDomains = (s.shield.webDomains ?? []).union(webDomains)
        }
    }

    static func unshield(app token: ApplicationToken) {
        let s = store
        var apps = s.shield.applications ?? []
        apps.remove(token)
        s.shield.applications = apps.isEmpty ? nil : apps
    }

    /// The cat pads away entirely.
    static func liftAll() {
        store.clearAllSettings()
        SharedStore.breakEndsAt = nil
    }
}
