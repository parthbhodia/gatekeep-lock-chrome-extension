import SwiftUI
import FamilyControls

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    /// CI/simulator convenience: `simctl launch ... -catbreak-ui-preview`
    /// shows the tabs without Screen Time authorization (which the simulator
    /// cannot grant) so the UI can be screenshotted. Monitoring stays off.
    private var uiPreview: Bool {
        ProcessInfo.processInfo.arguments.contains("-catbreak-ui-preview")
    }

    var body: some View {
        Group {
            if model.authorizationStatus == .approved || uiPreview {
                TabView {
                    CatTabView()
                        .tabItem { Label("Cat", systemImage: "cat") }
                    SettingsTabView()
                        .tabItem { Label("Settings", systemImage: "gearshape") }
                    StatsTabView()
                        .tabItem { Label("Stats", systemImage: "chart.bar") }
                }
            } else {
                AuthorizationGate()
            }
        }
        .task { await model.refreshVideos() }
        .onChange(of: scenePhase) { phase in
            if phase == .active { model.endExpiredBreakIfNeeded() }
        }
        .onOpenURL { model.handleDeepLink($0) }
        .fullScreenCover(item: $model.takeover) { request in
            BreakTakeoverView(request: request)
        }
    }
}
