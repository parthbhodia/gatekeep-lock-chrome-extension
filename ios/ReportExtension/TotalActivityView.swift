import SwiftUI

struct TotalActivityView: View {
    let summary: AppUsageSummary

    var body: some View {
        List {
            Section {
                HStack {
                    Text("Today, on watched apps")
                    Spacer()
                    Text(format(summary.total)).bold()
                }
            }
            Section("By app") {
                if summary.entries.isEmpty {
                    Text("No activity yet — go touch grass preemptively. 🐈")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(summary.entries) { entry in
                        HStack {
                            Text(entry.name)
                            Spacer()
                            Text(format(entry.duration)).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private func format(_ interval: TimeInterval) -> String {
        let minutes = Int(interval) / 60
        return minutes >= 60 ? "\(minutes / 60)h \(minutes % 60)m" : "\(minutes)m"
    }
}
