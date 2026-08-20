import DeviceActivity
import SwiftUI

struct AppUsageSummary {
    struct Entry: Identifiable {
        let id = UUID()
        let name: String
        let duration: TimeInterval
    }

    var total: TimeInterval = 0
    var entries: [Entry] = []
}

/// Sums today's screen time for the watched selection — the iOS version of the
/// overlay's time-on-site summary. This runs in a sandboxed report extension:
/// the numbers can be shown to the user but can never leave the extension,
/// which keeps Cat Break's privacy promise by construction.
struct TotalActivityReport: DeviceActivityReportScene {
    let context: DeviceActivityReport.Context = DeviceActivityReport.Context("TotalActivity")
    let content: (AppUsageSummary) -> TotalActivityView

    func makeConfiguration(
        representing data: DeviceActivityResults<DeviceActivityData>
    ) async -> AppUsageSummary {
        var summary = AppUsageSummary()
        var perApp: [String: TimeInterval] = [:]

        for await result in data {
            for await segment in result.activitySegments {
                summary.total += segment.totalActivityDuration
                for await category in segment.categories {
                    for await app in category.applications {
                        let name = app.application.localizedDisplayName ?? "App"
                        perApp[name, default: 0] += app.totalActivityDuration
                    }
                }
            }
        }

        summary.entries = perApp
            .map { AppUsageSummary.Entry(name: $0.key, duration: $0.value) }
            .sorted { $0.duration > $1.duration }
        return summary
    }
}
