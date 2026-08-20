import DeviceActivity
import ManagedSettings
import Foundation

/// Runs out-of-process. iOS calls these hooks as the day starts/ends and as
/// usage thresholds are reached — the Swift equivalent of background.js's
/// checkAndNotify() loop.
class DeviceActivityMonitorExtension: DeviceActivityMonitor {

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        guard activity == MonitorScheduler.dailyActivity else { return }
        // This hook fires both at real midnight and whenever monitoring is
        // restarted mid-day (settings change, post-break re-arm). Only treat
        // it as the daily reset when it actually happens around midnight.
        let comps = Calendar.current.dateComponents([.hour, .minute], from: Date())
        if (comps.hour ?? 12) == 0 && (comps.minute ?? 59) < 5 {
            SharedStore.resetFireCounts()
            ShieldController.liftAll()
        }
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        if activity == MonitorScheduler.breakActivity {
            // Auto-dismiss: the break is over, the cat pads away, and the
            // laddered thresholds re-arm the timer for this site's next round.
            ShieldController.liftAll()
            try? MonitorScheduler.refreshMonitoring()
        } else if activity == MonitorScheduler.dailyActivity {
            // 23:59 — clear any lingering shield before the new day begins.
            ShieldController.liftAll()
        }
    }

    override func eventDidReachThreshold(_ event: DeviceActivityEvent.Name, activity: DeviceActivityName) {
        super.eventDidReachThreshold(event, activity: activity)
        guard activity == MonitorScheduler.dailyActivity else { return }

        // Time's up: pick a fresh meow line for the shield, then drop the cat in.
        SharedStore.currentMeowLine = MeowLines.random()
        let covered = MonitorScheduler.coverage(of: event)
        ShieldController.shield(
            apps: covered.apps,
            categories: covered.categories,
            webDomains: covered.webDomains
        )

        // Advance the threshold ladder so the timer starts fresh after this
        // break, and schedule the break's automatic end when it's long enough.
        SharedStore.bumpFireCount(for: event.rawValue)
        MonitorScheduler.scheduleBreakEnd(after: SharedStore.loadSettings().breakMinutes)
    }
}
