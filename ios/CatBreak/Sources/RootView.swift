import SwiftUI
import FamilyControls

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if model.authorizationStatus == .approved {
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
    }
}
