import SwiftUI
import DeviceActivity

/// Today's watched-app screen time, rendered by the sandboxed report extension.
/// The app embeds the view but never sees the numbers — Apple's privacy design,
/// and a free upgrade to the extension's "no data leaves the device" promise.
struct StatsTabView: View {
    private let context = DeviceActivityReport.Context("TotalActivity")

    private var filter: DeviceActivityFilter {
        let now = Date()
        let start = Calendar.current.startOfDay(for: now)
        return DeviceActivityFilter(
            segment: .daily(during: DateInterval(start: start, end: now)),
            users: .all,
            devices: .init([.iPhone, .iPad])
        )
    }

    var body: some View {
        NavigationStack {
            DeviceActivityReport(context, filter: filter)
                .navigationTitle("Today")
        }
    }
}
